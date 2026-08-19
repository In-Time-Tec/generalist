/* oxlint-disable effecttsgo/async-function, effecttsgo/global-date, effecttsgo/global-timers, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, effecttsgo/run-effect-inside-effect, effecttsgo/try-catch-in-effect-gen */
import { Clock, Effect, Layer, Schema } from "effect"
import { ProgramCapabilities, SandboxExecutor } from "tenetkit"
import { normalize, runner } from "./source.js"
import type { CapabilityRpcRequest, Options, WorkerCode } from "./types.js"

const runnerName = "__tenetkit_runner.js"
const maximumDiagnostic = 160
const safeMessage = (cause: unknown): string =>
  (cause instanceof Error ? cause.message : String(cause)).replace(/[\r\n\t]+/g, " ").slice(0, maximumDiagnostic)

const failExecution = (cause: unknown) =>
  SandboxExecutor.SandboxExecutionFailure.make({ message: `dynamic Worker execution failed: ${safeMessage(cause)}` })

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength

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
        const now = yield* Clock.currentTimeMillis
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
        try {
          const encoded = JSON.stringify(request.input)
          if (encoded === undefined) throw new TypeError("input is not JSON serializable")
        } catch {
          return yield* SandboxExecutor.SandboxInputInvalid.make({ message: "sandbox input is not JSON serializable" })
        }

        const capabilities = yield* ProgramCapabilities.ProgramCapabilities
        const grants = new Map(request.capabilities.map((grant) => [grant.operation, new Set(grant.names)] as const))
        let active = true
        const rpc = {
          call: async (raw: CapabilityRpcRequest): Promise<unknown> => {
            if (!active || request.signal.aborted || Date.now() >= request.deadlineMillis)
              throw new Error("request fence closed")
            if (raw.protocolVersion !== request.protocolVersion || raw.requestId !== request.requestId)
              throw new Error("capability protocol identity mismatch")
            const grant = grants.get(raw.operation)
            if (grant === undefined) throw new Error("capability operation denied")
            const named =
              typeof raw.input === "object" && raw.input !== null
                ? "tool" in raw.input
                  ? raw.input.tool
                  : "step" in raw.input
                    ? raw.input.step
                    : "selection" in raw.input
                      ? raw.input.selection
                      : undefined
                : undefined
            if (typeof named === "string" && !grant.has(named)) throw new Error("capability name denied")
            const effect =
              raw.operation === "discoverTools"
                ? capabilities.discoverTools
                : raw.operation === "describeTool"
                  ? capabilities.describeTool(String(raw.input))
                  : capabilities[raw.operation](raw.input as never)
            const value = await Effect.runPromise(effect)
            if (!active || request.signal.aborted || Date.now() >= request.deadlineMillis)
              throw new Error("request fence closed")
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
        const remaining = request.deadlineMillis - now
        const abort = new Promise<never>((_, reject) => {
          request.signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })
        })
        const deadline = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error("deadline")), Math.min(remaining, 2_147_483_647))
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
                      body: JSON.stringify({
                        protocolVersion: request.protocolVersion,
                        requestId: request.requestId,
                        input: request.input,
                      }),
                    }),
                  ),
                abort,
                deadline,
              ]),
            catch: (cause) =>
              request.signal.aborted
                ? SandboxExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
                : Date.now() >= request.deadlineMillis || safeMessage(cause) === "deadline"
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
          if (!response.ok) return yield* failExecution(`dynamic Worker returned status ${response.status}`)
          const text = yield* Effect.tryPromise({ try: () => response.text(), catch: failExecution })
          if (new TextEncoder().encode(text).byteLength > request.limits.outputBytes)
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
          if (bytes(result.output) > request.limits.outputBytes)
            return yield* SandboxExecutor.SandboxResourceExceeded.make({
              resource: "output",
              limit: request.limits.outputBytes,
            })
          return result
        } finally {
          active = false
        }
      }),
  })

/** @experimental Provide the Worker Loader SandboxExecutor. */
export const layer = (options: Options): Layer.Layer<SandboxExecutor.Service> =>
  Layer.succeed(SandboxExecutor.SandboxExecutor, make(options))

export type {
  CapabilityRpc,
  CapabilityRpcRequest,
  Fetcher,
  Options,
  WorkerCode,
  WorkerLoader,
  WorkerStub,
} from "./types.js"
