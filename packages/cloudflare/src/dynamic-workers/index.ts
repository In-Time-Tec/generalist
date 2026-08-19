/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/async-function, effecttsgo/global-date, effecttsgo/global-date-in-effect, effecttsgo/global-timers-in-effect, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, effecttsgo/run-effect-inside-effect, effecttsgo/try-catch-in-effect-gen, effecttsgo/unnecessary-fail-yieldable-error, no-await-in-loop */
import { Effect, Layer, Result, Schema } from "effect"
import { ProgramCapabilities, SandboxExecutor } from "tenetkit"
import { normalize, runner, runnerName } from "./source.js"
import { CapabilityRpcRequest, type Options, type WorkerCode } from "./types.js"

const maximumDiagnostic = 160
const safeMessage = (cause: unknown): string => {
  try {
    return (cause instanceof Error ? cause.message : String(cause))
      .replace(/[\r\n\t]+/g, " ")
      .slice(0, maximumDiagnostic)
  } catch {
    return "uninspectable failure"
  }
}

const failExecution = (cause: unknown) =>
  SandboxExecutor.SandboxExecutionFailure.make({ message: `dynamic Worker execution failed: ${safeMessage(cause)}` })

const encodeJson = (value: unknown): string | undefined => {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const bytes = (value: unknown): number | undefined => {
  const encoded = encodeJson(value)
  return encoded === undefined ? undefined : new TextEncoder().encode(encoded).byteLength
}

const readBounded = async (response: Response, limit: number): Promise<string | undefined> => {
  if (response.body === null) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  while (true) {
    const next = await reader.read()
    if (next.done) return text + decoder.decode()
    size += next.value.byteLength
    if (size > limit) {
      await reader.cancel()
      return undefined
    }
    text += decoder.decode(next.value, { stream: true })
  }
}

const capabilityName = (request: CapabilityRpcRequest): string | undefined => {
  switch (request.operation) {
    case "describeTool":
      return request.input
    case "callTool":
      return request.input.tool
    case "callStep":
      return request.input.step
    case "runAgent":
    case "mapAgents":
      return request.input.selection
    default:
      return undefined
  }
}

/** @experimental Construct a production SandboxExecutor backed by Cloudflare Worker Loader. */
export const make = (options: Options): SandboxExecutor.Interface =>
  SandboxExecutor.SandboxExecutor.of({
    identity: Object.freeze({
      implementation: "@tenetkit/cloudflare/dynamic-workers",
      protocolVersion: SandboxExecutor.protocolVersion,
      compatibilityDate: options.compatibilityDate,
      isolation: "worker-loader-load",
      globalOutbound: false,
    }),
    execute: (request) =>
      Effect.gen(function* () {
        const now = Date.now()
        if (request.signal.aborted)
          return yield* SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
        if (now >= request.deadlineMillis)
          return yield* SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
        let source: ReturnType<typeof normalize>
        try {
          source = normalize(request)
          if (
            SandboxExecutor.sourceDigest({
              modules: source.modules,
              entrypoint: request.entrypoint,
              inputCodec: request.inputCodec,
              outputCodec: request.outputCodec,
              protocolVersion: request.protocolVersion,
            }) !== request.sourceDigest
          )
            return yield* SandboxExecutor.SandboxSourceInvalid.make({ message: "source digest mismatch" })
        } catch (cause) {
          return yield* SandboxExecutor.SandboxSourceInvalid.make({ message: safeMessage(cause) })
        }
        let encodedInput: string
        try {
          const encoded = JSON.stringify(request.input)
          if (encoded === undefined) throw new TypeError("input is not JSON serializable")
          encodedInput = encoded
        } catch {
          return yield* SandboxExecutor.SandboxInputInvalid.make({ message: "sandbox input is not JSON serializable" })
        }

        const capabilities = yield* ProgramCapabilities.ProgramCapabilities
        const grants = new Map(request.capabilities.map((grant) => [grant.operation, new Set(grant.names)] as const))
        let active = true
        let capabilityFailure: ProgramCapabilities.CapabilityFailure | undefined
        const invocation = new AbortController()
        const cancel = () => invocation.abort()
        let deadlineElapsed = false
        const rpc = {
          call: async (raw: CapabilityRpcRequest): Promise<unknown> => {
            if (!active || request.signal.aborted || Date.now() >= request.deadlineMillis)
              throw new Error("request fence closed")
            let decoded: CapabilityRpcRequest
            try {
              decoded = Schema.decodeUnknownSync(CapabilityRpcRequest, { onExcessProperty: "error" })(raw)
            } catch {
              throw new Error("capability request invalid")
            }
            if (decoded.protocolVersion !== request.protocolVersion || decoded.requestId !== request.requestId)
              throw new Error("capability protocol identity mismatch")
            const grant = grants.get(decoded.operation)
            if (grant === undefined) throw new Error("capability operation denied")
            const named = capabilityName(decoded)
            if (named !== undefined && !grant.has(named)) throw new Error("capability name denied")
            if (decoded.operation === "fanOutAgents") {
              for (const member of decoded.input.members) {
                if (!grant.has(member.selection)) throw new Error("capability name denied")
              }
            }
            const inputSize = decoded.input === undefined ? 0 : bytes(decoded.input)
            if (inputSize === undefined || inputSize > request.limits.outputBytes)
              throw new Error("capability payload denied")
            const effect =
              decoded.operation === "discoverTools"
                ? capabilities.discoverTools.pipe(Effect.map((tools) => tools.filter((tool) => grant.has(tool.name))))
                : decoded.operation === "describeTool"
                  ? capabilities.describeTool(decoded.input)
                  : capabilities[decoded.operation](decoded.input as never)
            let value: unknown
            try {
              const outcome = await Effect.runPromise(Effect.result(effect), { signal: invocation.signal })
              if (Result.isFailure(outcome)) {
                capabilityFailure = outcome.failure
                throw new Error("capability invocation failed")
              }
              value = outcome.success
            } catch {
              throw new Error("capability invocation failed")
            }
            if (!active || request.signal.aborted || Date.now() >= request.deadlineMillis)
              throw new Error("request fence closed")
            const outputSize = bytes(value)
            if (outputSize === undefined || outputSize > request.limits.outputBytes)
              throw new Error("capability result denied")
            return value
          },
        }
        const code: WorkerCode = {
          compatibilityDate: options.compatibilityDate,
          mainModule: runnerName,
          modules: { ...source.record, [runnerName]: runner(request.entrypoint) },
          globalOutbound: null,
          env: {
            TENET_CAPABILITIES: options.capabilityBinding(rpc),
            TENET_PROTOCOL_VERSION: request.protocolVersion,
            TENET_REQUEST_ID: request.requestId,
            TENET_SOURCE_DIGEST: request.sourceDigest,
            TENET_INPUT_CODEC: request.inputCodec,
            TENET_OUTPUT_CODEC: request.outputCodec,
          },
          limits: { cpuMs: request.limits.cpuMillis, subrequests: request.limits.subrequests },
        }
        request.signal.addEventListener("abort", cancel, { once: true })
        const deadlineTimer = setTimeout(
          () => {
            deadlineElapsed = true
            cancel()
          },
          Math.min(request.deadlineMillis - now, 2_147_483_647),
        )
        const abort = new Promise<never>((_, reject) => {
          invocation.signal.addEventListener("abort", () => reject(new Error("interrupted")), { once: true })
        })
        try {
          const response = yield* Effect.tryPromise({
            try: () =>
              Promise.race([
                options.loader
                  .load(code)
                  .getEntrypoint()
                  .fetch(
                    new Request("https://sandbox.tenetkit.invalid/execute", {
                      method: "POST",
                      signal: invocation.signal,
                      body: `{"protocolVersion":${JSON.stringify(request.protocolVersion)},"requestId":${JSON.stringify(request.requestId)},"input":${encodedInput}}`,
                    }),
                  ),
                abort,
              ]),
            catch: (cause) =>
              request.signal.aborted
                ? SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
                : deadlineElapsed || Date.now() >= request.deadlineMillis
                  ? SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
                  : /cpu/i.test(safeMessage(cause))
                    ? SandboxExecutor.SandboxResourceExceeded.make({
                        resource: "cpu",
                        limit: request.limits.cpuMillis,
                      })
                    : /subrequest/i.test(safeMessage(cause))
                      ? SandboxExecutor.SandboxResourceExceeded.make({
                          resource: "subrequests",
                          limit: request.limits.subrequests,
                        })
                      : failExecution(cause),
          })
          if (!active || request.signal.aborted)
            return yield* SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
          if (!response.ok) {
            if (capabilityFailure !== undefined) return yield* Effect.fail(capabilityFailure)
            return yield* failExecution(`dynamic Worker returned status ${response.status}`)
          }
          const text = yield* Effect.tryPromise({
            try: () => Promise.race([readBounded(response, request.limits.outputBytes), abort]),
            catch: (cause) =>
              request.signal.aborted
                ? SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
                : deadlineElapsed || Date.now() >= request.deadlineMillis
                  ? SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
                  : failExecution(cause),
          })
          if (!active || request.signal.aborted)
            return yield* SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
          if (text === undefined)
            return yield* SandboxExecutor.SandboxResourceExceeded.make({
              resource: "output",
              limit: request.limits.outputBytes,
            })
          let decoded: unknown
          try {
            decoded = JSON.parse(text)
          } catch {
            return yield* SandboxExecutor.SandboxOutputInvalid.make({ message: "sandbox output is not JSON" })
          }
          const result = yield* Schema.decodeUnknownEffect(SandboxExecutor.Result, { onExcessProperty: "error" })(
            decoded,
          ).pipe(
            Effect.mapError(() =>
              SandboxExecutor.SandboxProtocolViolation.make({ message: "invalid result envelope" }),
            ),
          )
          if (
            result.protocolVersion !== request.protocolVersion ||
            result.requestId !== request.requestId ||
            result.sourceDigest !== request.sourceDigest ||
            result.inputCodec !== request.inputCodec ||
            result.outputCodec !== request.outputCodec
          )
            return yield* SandboxExecutor.SandboxProtocolViolation.make({ message: "result identity mismatch" })
          const resultBytes = bytes(result.output)
          if (resultBytes === undefined)
            return yield* SandboxExecutor.SandboxOutputInvalid.make({
              message: "sandbox output is not JSON serializable",
            })
          if (resultBytes > request.limits.outputBytes)
            return yield* SandboxExecutor.SandboxResourceExceeded.make({
              resource: "output",
              limit: request.limits.outputBytes,
            })
          if (!active || request.signal.aborted)
            return yield* SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* SandboxExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
          return result
        } finally {
          active = false
          clearTimeout(deadlineTimer)
          request.signal.removeEventListener("abort", cancel)
          invocation.abort()
        }
      }),
  })

/** @experimental Construct an explicitly disabled Worker Loader boundary. */
export const makeUnavailable = (message = "Worker Loader is unavailable"): SandboxExecutor.Interface =>
  SandboxExecutor.SandboxExecutor.of({
    identity: Object.freeze({
      implementation: "@tenetkit/cloudflare/dynamic-workers",
      protocolVersion: SandboxExecutor.protocolVersion,
      available: false,
    }),
    execute: () => SandboxExecutor.SandboxUnavailable.make({ message }),
  })

/** @experimental Provide the Worker Loader SandboxExecutor. */
export const layer = (options: Options): Layer.Layer<SandboxExecutor.Service> =>
  Layer.succeed(SandboxExecutor.SandboxExecutor, make(options))

/** @experimental Provide an explicitly disabled Worker Loader boundary. */
export const layerUnavailable = (message?: string): Layer.Layer<SandboxExecutor.Service> =>
  Layer.succeed(SandboxExecutor.SandboxExecutor, makeUnavailable(message))

export type {
  CapabilityRpc,
  CapabilityRpcRequest,
  Fetcher,
  Options,
  WorkerCode,
  WorkerLoader,
  WorkerStub,
} from "./types.js"
