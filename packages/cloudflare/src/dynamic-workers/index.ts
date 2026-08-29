/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/async-function, effecttsgo/global-date, effecttsgo/global-date-in-effect, effecttsgo/global-timers-in-effect, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, effecttsgo/run-effect-inside-effect, effecttsgo/try-catch-in-effect-gen, effecttsgo/unnecessary-fail-yieldable-error, no-await-in-loop */
import { Effect, Layer, Option, Result, Schema } from "effect"
import { CodeExecutor, ProgramCapabilities } from "tenetkit"
import { capabilityFailurePrefix, normalize, runner, runnerName } from "./source.js"
import { type CapabilityRpc, CapabilityRpcRequest, type Options, type WorkerCode } from "./types.js"

const maximumDiagnostic = 160
const CapabilityFailureResponse = Schema.Struct({
  error: Schema.Literal("sandbox execution failed"),
  capabilityFailureId: Schema.String,
})
const redactDiagnostic = (message: string): string =>
  message
    .replace(/(\bauthorization\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(/(\bbearer\s+)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[REDACTED]")
    .replace(
      /((?:["'])?[A-Za-z0-9_.-]*(?:token|secret|password|passwd|credential|key)[A-Za-z0-9_.-]*(?:["'])?\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]",
    )
const safeMessage = (cause: unknown): string => {
  try {
    return redactDiagnostic((cause instanceof Error ? cause.message : String(cause)).replace(/[\r\n\t]+/g, " ")).slice(
      0,
      maximumDiagnostic,
    )
  } catch {
    return "uninspectable failure"
  }
}

const failExecution = (cause: unknown) =>
  CodeExecutor.SandboxExecutionFailure.make({ message: `dynamic Worker execution failed: ${safeMessage(cause)}` })

const encodeJson = <A>(value: A): string | undefined => {
  try {
    return JSON.stringify(value)
  } catch {
    return undefined
  }
}

const bytes = <A>(value: A): number | undefined => {
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

type CapabilityGrant = ReadonlyMap<CapabilityRpcRequest["operation"], ReadonlySet<string>>

interface CapabilityInvocation {
  readonly capabilities: ProgramCapabilities.Service
  readonly request: CodeExecutor.Request
  readonly grants: CapabilityGrant
  readonly signal: AbortSignal
  readonly isActive: () => boolean
  readonly recordFailure: (failure: ProgramCapabilities.CapabilityFailure) => string
}

const validateCapabilityRequest = (
  raw: CapabilityRpcRequest,
  invocation: CapabilityInvocation,
): readonly [CapabilityRpcRequest, ReadonlySet<string>] => {
  let decoded: CapabilityRpcRequest
  try {
    decoded = Schema.decodeSync(CapabilityRpcRequest, { onExcessProperty: "error" })(raw)
  } catch {
    throw new Error("capability request invalid")
  }
  if (
    decoded.protocolVersion !== invocation.request.protocolVersion ||
    decoded.requestId !== invocation.request.requestId
  )
    throw new Error("capability protocol identity mismatch")
  const grant = invocation.grants.get(decoded.operation)
  if (grant === undefined) throw new Error("capability operation denied")
  const named = capabilityName(decoded)
  if (named !== undefined && !grant.has(named)) throw new Error("capability name denied")
  if (decoded.operation === "fanOutAgents" && decoded.input.members.some((member) => !grant.has(member.selection)))
    throw new Error("capability name denied")
  const inputSize = decoded.input === undefined ? 0 : bytes(decoded.input)
  if (inputSize === undefined || inputSize > invocation.request.limits.outputBytes)
    throw new Error("capability payload denied")
  return [decoded, grant]
}

const invokeCapability = async (
  capabilities: ProgramCapabilities.Service,
  request: CapabilityRpcRequest,
  grant: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<Schema.Json> => {
  let outcome: Result.Result<unknown, ProgramCapabilities.CapabilityFailure>
  try {
    switch (request.operation) {
      case "discoverTools":
        outcome = await Effect.runPromise(
          Effect.result(
            capabilities.discoverTools.pipe(Effect.map((tools) => tools.filter((tool) => grant.has(tool.name)))),
          ),
          { signal },
        )
        break
      case "describeTool":
        outcome = await Effect.runPromise(Effect.result(capabilities.describeTool(request.input)), { signal })
        break
      case "callTool":
        outcome = await Effect.runPromise(Effect.result(capabilities.callTool(request.input)), { signal })
        break
      case "callStep":
        outcome = await Effect.runPromise(Effect.result(capabilities.callStep(request.input)), { signal })
        break
      case "runAgent":
        outcome = await Effect.runPromise(Effect.result(capabilities.runAgent(request.input)), { signal })
        break
      case "mapAgents":
        outcome = await Effect.runPromise(Effect.result(capabilities.mapAgents(request.input)), { signal })
        break
      case "fanOutAgents":
        outcome = await Effect.runPromise(Effect.result(capabilities.fanOutAgents(request.input)), { signal })
        break
      case "log":
        outcome = await Effect.runPromise(Effect.result(capabilities.log(request.input)), { signal })
        break
    }
  } catch {
    throw new Error("capability invocation failed")
  }
  if (Result.isFailure(outcome)) throw outcome.failure
  try {
    return Schema.decodeUnknownSync(Schema.Json)(outcome.success)
  } catch {
    throw new Error("capability result denied")
  }
}

const makeCapabilityRpc = (invocation: CapabilityInvocation): CapabilityRpc => ({
  call: async (raw) => {
    if (!invocation.isActive()) throw new Error("request fence closed")
    const [decoded, grant] = validateCapabilityRequest(raw, invocation)
    try {
      const value = await invokeCapability(invocation.capabilities, decoded, grant, invocation.signal)
      if (!invocation.isActive()) throw new Error("request fence closed")
      const outputSize = bytes(value)
      if (outputSize === undefined || outputSize > invocation.request.limits.outputBytes)
        throw new Error("capability result denied")
      return value
    } catch (cause) {
      if (Schema.is(ProgramCapabilities.CapabilityFailure)(cause)) {
        throw new Error(`${capabilityFailurePrefix}${invocation.recordFailure(cause)}`, { cause })
      }
      throw cause
    }
  },
})

const loaderFailure = (
  cause: unknown,
  request: CodeExecutor.Request,
  deadlineElapsed: boolean,
): CodeExecutor.ExecutionFailure => {
  if (request.signal.aborted) return CodeExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
  if (deadlineElapsed || Date.now() >= request.deadlineMillis)
    return CodeExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
  const message = safeMessage(cause)
  if (/cpu/i.test(message))
    return CodeExecutor.SandboxResourceExceeded.make({ resource: "cpu", limit: request.limits.cpuMillis })
  if (/subrequest/i.test(message))
    return CodeExecutor.SandboxResourceExceeded.make({
      resource: "subrequests",
      limit: request.limits.subrequests,
    })
  return failExecution(cause)
}

const resultIdentityMatches = (result: CodeExecutor.Result, request: CodeExecutor.Request): boolean =>
  result.protocolVersion === request.protocolVersion &&
  result.requestId === request.requestId &&
  result.sourceDigest === request.sourceDigest &&
  result.inputCodec === request.inputCodec &&
  result.outputCodec === request.outputCodec

const recoverCapabilityFailure = (
  response: Response,
  decoded: Schema.Json,
  failures: Map<string, ProgramCapabilities.CapabilityFailure>,
): ProgramCapabilities.CapabilityFailure | undefined => {
  if (response.status !== 500) return undefined
  const envelope = Schema.decodeUnknownOption(CapabilityFailureResponse, { onExcessProperty: "error" })(decoded)
  if (Option.isNone(envelope)) return undefined
  const failure = failures.get(envelope.value.capabilityFailureId)
  if (failure !== undefined) failures.delete(envelope.value.capabilityFailureId)
  return failure
}

const decodeResponseJson = Schema.decodeOption(Schema.fromJsonString(Schema.Json))

const prepareRequest = (request: CodeExecutor.Request) =>
  Effect.gen(function* () {
    const source = yield* Effect.try({
      try: () => normalize(request),
      catch: (cause) => CodeExecutor.SandboxSourceInvalid.make({ message: safeMessage(cause) }),
    })
    if (
      CodeExecutor.sourceDigest({
        modules: source.modules,
        entrypoint: request.entrypoint,
        inputCodec: request.inputCodec,
        outputCodec: request.outputCodec,
        protocolVersion: request.protocolVersion,
      }) !== request.sourceDigest
    )
      return yield* CodeExecutor.SandboxSourceInvalid.make({ message: "source digest mismatch" })
    const encodedInput = encodeJson(request.input)
    if (encodedInput === undefined)
      return yield* CodeExecutor.SandboxInputInvalid.make({ message: "sandbox input is not JSON serializable" })
    return { source, encodedInput }
  })

const decodeWorkerResponse = (
  response: Response,
  text: string | undefined,
  request: CodeExecutor.Request,
  capabilityFailures: Map<string, ProgramCapabilities.CapabilityFailure>,
) =>
  Effect.gen(function* () {
    if (text === undefined)
      return yield* CodeExecutor.SandboxResourceExceeded.make({
        resource: "output",
        limit: request.limits.outputBytes,
      })
    const decodedOption = decodeResponseJson(text)
    if (Option.isNone(decodedOption)) {
      if (!response.ok) return yield* failExecution(`dynamic Worker returned status ${response.status}`)
      return yield* CodeExecutor.SandboxOutputInvalid.make({ message: "sandbox output is not JSON" })
    }
    const decoded = decodedOption.value
    if (!response.ok) {
      const failure = recoverCapabilityFailure(response, decoded, capabilityFailures)
      if (failure !== undefined) return yield* Effect.fail(failure)
      return yield* failExecution(`dynamic Worker returned status ${response.status}`)
    }
    const result = yield* Schema.decodeUnknownEffect(CodeExecutor.Result, { onExcessProperty: "error" })(decoded).pipe(
      Effect.mapError(() => CodeExecutor.SandboxProtocolViolation.make({ message: "invalid result envelope" })),
    )
    if (!resultIdentityMatches(result, request))
      return yield* CodeExecutor.SandboxProtocolViolation.make({ message: "result identity mismatch" })
    const resultBytes = bytes(result.output)
    if (resultBytes === undefined)
      return yield* CodeExecutor.SandboxOutputInvalid.make({ message: "sandbox output is not JSON serializable" })
    if (resultBytes > request.limits.outputBytes)
      return yield* CodeExecutor.SandboxResourceExceeded.make({
        resource: "output",
        limit: request.limits.outputBytes,
      })
    return result
  })

/** @experimental Construct a production CodeExecutor backed by Cloudflare Worker Loader. */
export const make = (options: Options): CodeExecutor.Service =>
  CodeExecutor.CodeExecutor.of({
    identity: Object.freeze({
      implementation: "@tenetkit/cloudflare/dynamic-workers",
      protocolVersion: CodeExecutor.protocolVersion,
      compatibilityDate: options.compatibilityDate,
      isolation: "worker-loader-load",
      globalOutbound: false,
    }),
    execute: (request) =>
      Effect.gen(function* () {
        const now = Date.now()
        if (request.signal.aborted)
          return yield* CodeExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
        if (now >= request.deadlineMillis)
          return yield* CodeExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
        const { source, encodedInput } = yield* prepareRequest(request)

        const capabilities = yield* ProgramCapabilities.ProgramCapabilities
        const grants = new Map(request.capabilities.map((grant) => [grant.operation, new Set(grant.names)] as const))
        let active = true
        const capabilityFailures = new Map<string, ProgramCapabilities.CapabilityFailure>()
        let nextCapabilityFailure = 0
        const invocation = new AbortController()
        const cancel = () => invocation.abort()
        let deadlineElapsed = false
        const rpc = makeCapabilityRpc({
          capabilities,
          request,
          grants,
          signal: invocation.signal,
          isActive: () => active && !request.signal.aborted && Date.now() < request.deadlineMillis,
          recordFailure: (failure) => {
            const failureId = `failure-${++nextCapabilityFailure}`
            capabilityFailures.set(failureId, failure)
            return failureId
          },
        })
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
            catch: (cause) => loaderFailure(cause, request, deadlineElapsed),
          })
          if (!active || request.signal.aborted)
            return yield* CodeExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* CodeExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
          const text = yield* Effect.tryPromise({
            try: () => Promise.race([readBounded(response, request.limits.outputBytes), abort]),
            catch: (cause) => loaderFailure(cause, request, deadlineElapsed),
          })
          if (!active || request.signal.aborted)
            return yield* CodeExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* CodeExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
          const result = yield* decodeWorkerResponse(response, text, request, capabilityFailures)
          if (!active || request.signal.aborted)
            return yield* CodeExecutor.SandboxCancelled.make({ message: "sandbox request was cancelled" })
          if (deadlineElapsed || Date.now() >= request.deadlineMillis)
            return yield* CodeExecutor.SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
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
export const makeUnavailable = (message = "Worker Loader is unavailable"): CodeExecutor.Service =>
  CodeExecutor.CodeExecutor.of({
    identity: Object.freeze({
      implementation: "@tenetkit/cloudflare/dynamic-workers",
      protocolVersion: CodeExecutor.protocolVersion,
      available: false,
    }),
    execute: () => CodeExecutor.SandboxUnavailable.make({ message }),
  })

/** @experimental Provide the Worker Loader CodeExecutor. */
export const layer = (options: Options): Layer.Layer<CodeExecutor.CodeExecutor> =>
  Layer.succeed(CodeExecutor.CodeExecutor, make(options))

/** @experimental Provide an explicitly disabled Worker Loader boundary. */
export const layerUnavailable = (message?: string): Layer.Layer<CodeExecutor.CodeExecutor> =>
  Layer.succeed(CodeExecutor.CodeExecutor, makeUnavailable(message))

export type {
  CapabilityRpc,
  CapabilityRpcRequest,
  Fetcher,
  Options,
  WorkerCode,
  WorkerLoader,
  WorkerStub,
} from "./types.js"
