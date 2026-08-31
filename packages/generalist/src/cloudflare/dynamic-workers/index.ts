/* oxlint-disable effecttsgo/abort-controller-in-effect, effecttsgo/async-function, effecttsgo/new-promise, effecttsgo/prefer-schema-over-json, effecttsgo/run-effect-inside-effect, effecttsgo/try-catch-in-effect-gen, effecttsgo/unnecessary-fail-yieldable-error, no-await-in-loop */
import { Clock, Duration, Effect, Layer, Option, Result, Schema } from "effect"
import {
  admit,
  CodeExecutor,
  declareIdentity,
  type ExecutionFailure,
  protocolVersion,
  type Request,
  SandboxCancelled,
  SandboxDeadlineExceeded,
  SandboxExecutionFailure,
  SandboxInputInvalid,
  SandboxOutputInvalid,
  SandboxResourceExceeded,
  SandboxSourceInvalid,
  SandboxUnavailable,
  type Service as CodeExecutorService,
  sourceDigest,
  validateResult,
} from "../../core/program/code-executor.js"
import {
  CapabilityFailure,
  ProgramCapabilities,
  type Service as ProgramCapabilitiesService,
} from "../../core/program/capabilities.js"
import { identity } from "./identity.js"
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
  SandboxExecutionFailure.make({ message: `dynamic Worker execution failed: ${safeMessage(cause)}` })

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

const readBounded = async (response: Response, limit: number, signal: AbortSignal): Promise<string | undefined> => {
  if (response.body === null) return ""
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ""
  let rejectAborted!: (cause: Error) => void
  const aborted = new Promise<never>((_, reject) => {
    rejectAborted = reject
  })
  const abort = () => rejectAborted(new Error("interrupted"))
  signal.addEventListener("abort", abort, { once: true })
  try {
    while (true) {
      const next = await Promise.race([reader.read(), aborted])
      if (next.done) return text + decoder.decode()
      size += next.value.byteLength
      if (size > limit) {
        void reader.cancel().catch(() => undefined)
        return undefined
      }
      text += decoder.decode(next.value, { stream: true })
    }
  } finally {
    signal.removeEventListener("abort", abort)
    if (signal.aborted) void reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

const raceAbort = <A>(promise: Promise<A>, signal: AbortSignal): Promise<A> =>
  new Promise<A>((resolve, reject) => {
    const abort = () => reject(new Error("interrupted"))
    signal.addEventListener("abort", abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
    if (signal.aborted) abort()
  })

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
  readonly capabilities: ProgramCapabilitiesService
  readonly request: Request
  readonly grants: CapabilityGrant
  readonly signal: AbortSignal
  readonly isActive: () => boolean
  readonly recordFailure: (failure: CapabilityFailure) => string
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
  capabilities: ProgramCapabilitiesService,
  request: CapabilityRpcRequest,
  grant: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<Schema.Json> => {
  let outcome: Result.Result<unknown, CapabilityFailure>
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
      if (Schema.is(CapabilityFailure)(cause)) {
        throw new Error(`${capabilityFailurePrefix}${invocation.recordFailure(cause)}`, { cause })
      }
      throw cause
    }
  },
})

const loaderFailure = (cause: unknown, request: Request, deadlineElapsed: boolean): ExecutionFailure => {
  if (request.signal.aborted) return SandboxCancelled.make({ message: "sandbox request was cancelled" })
  if (deadlineElapsed) return SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
  const message = safeMessage(cause)
  if (/cpu/i.test(message)) return SandboxResourceExceeded.make({ resource: "cpu", limit: request.limits.cpuMillis })
  if (/subrequest/i.test(message))
    return SandboxResourceExceeded.make({
      resource: "subrequests",
      limit: request.limits.subrequests,
    })
  return failExecution(cause)
}

const recoverCapabilityFailure = (
  response: Response,
  decoded: Schema.Json,
  failures: Map<string, CapabilityFailure>,
): CapabilityFailure | undefined => {
  if (response.status !== 500) return undefined
  const envelope = Schema.decodeUnknownOption(CapabilityFailureResponse, { onExcessProperty: "error" })(decoded)
  if (Option.isNone(envelope)) return undefined
  const failure = failures.get(envelope.value.capabilityFailureId)
  if (failure !== undefined) failures.delete(envelope.value.capabilityFailureId)
  return failure
}

const decodeResponseJson = Schema.decodeOption(Schema.fromJsonString(Schema.Json))

const prepareRequest = (request: Request) =>
  Effect.gen(function* () {
    const source = yield* Effect.try({
      try: () => normalize(request),
      catch: (cause) => SandboxSourceInvalid.make({ message: safeMessage(cause) }),
    })
    if (
      sourceDigest({
        modules: source.modules,
        entrypoint: request.entrypoint,
        inputCodec: request.inputCodec,
        outputCodec: request.outputCodec,
        protocolVersion: request.protocolVersion,
      }) !== request.sourceDigest
    )
      return yield* SandboxSourceInvalid.make({ message: "source digest mismatch" })
    const encodedInput = encodeJson(request.input)
    if (encodedInput === undefined)
      return yield* SandboxInputInvalid.make({ message: "sandbox input is not JSON serializable" })
    return { source, encodedInput }
  })

const decodeWorkerResponse = (
  response: Response,
  text: string | undefined,
  request: Request,
  capabilityFailures: Map<string, CapabilityFailure>,
) =>
  Effect.gen(function* () {
    if (text === undefined)
      return yield* SandboxResourceExceeded.make({
        resource: "output",
        limit: request.limits.outputBytes,
      })
    const decodedOption = decodeResponseJson(text)
    if (Option.isNone(decodedOption)) {
      if (!response.ok) return yield* failExecution(`dynamic Worker returned status ${response.status}`)
      return yield* SandboxOutputInvalid.make({ message: "sandbox output is not JSON" })
    }
    const decoded = decodedOption.value
    if (!response.ok) {
      const failure = recoverCapabilityFailure(response, decoded, capabilityFailures)
      if (failure !== undefined) return yield* Effect.fail(failure)
      return yield* failExecution(`dynamic Worker returned status ${response.status}`)
    }
    const result = yield* validateResult(request, decoded)
    const resultBytes = bytes(result.output)
    if (resultBytes === undefined)
      return yield* SandboxOutputInvalid.make({ message: "sandbox output is not JSON serializable" })
    if (resultBytes > request.limits.outputBytes)
      return yield* SandboxResourceExceeded.make({
        resource: "output",
        limit: request.limits.outputBytes,
      })
    return result
  })

const interruptionFailure = (request: Request, deadlineElapsed: boolean) => {
  if (request.signal.aborted) return SandboxCancelled.make({ message: "sandbox request was cancelled" })
  if (deadlineElapsed) return SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
  return undefined
}

/** @experimental Construct a production CodeExecutor backed by Cloudflare Worker Loader. */
export const make = (options: Options): CodeExecutorService => {
  const executorIdentity = identity(options.compatibilityDate)
  return CodeExecutor.of({
    identity: executorIdentity,
    execute: (request) =>
      Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis
        if (request.signal.aborted) return yield* SandboxCancelled.make({ message: "sandbox request was cancelled" })
        if (now >= request.deadlineMillis)
          return yield* SandboxDeadlineExceeded.make({ message: "sandbox deadline elapsed" })
        yield* admit(executorIdentity, request, now)
        const { source, encodedInput } = yield* prepareRequest(request)

        const capabilities = yield* ProgramCapabilities
        return yield* Effect.scoped(
          Effect.gen(function* () {
            const grants = new Map(
              request.capabilities.map((grant) => [grant.operation, new Set(grant.names)] as const),
            )
            let active = true
            const capabilityFailures = new Map<string, CapabilityFailure>()
            let nextCapabilityFailure = 0
            const invocation = new AbortController()
            const cancel = () => invocation.abort()
            let deadlineElapsed = false
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                active = false
                request.signal.removeEventListener("abort", cancel)
                invocation.abort()
              }),
            )

            request.signal.addEventListener("abort", cancel, { once: true })
            if (request.signal.aborted) cancel()
            const currentTime = yield* Clock.currentTimeMillis
            const remaining = request.deadlineMillis - currentTime
            if (remaining <= 0) {
              deadlineElapsed = true
              cancel()
            } else {
              yield* Effect.sleep(Duration.millis(remaining)).pipe(
                Effect.andThen(
                  Effect.sync(() => {
                    deadlineElapsed = true
                    cancel()
                  }),
                ),
                Effect.forkScoped,
              )
            }
            const beforeLoad = interruptionFailure(request, deadlineElapsed)
            if (beforeLoad !== undefined) return yield* beforeLoad

            const rpc = makeCapabilityRpc({
              capabilities,
              request,
              grants,
              signal: invocation.signal,
              isActive: () => active && !request.signal.aborted && !deadlineElapsed,
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
              limits: { cpuMs: request.limits.cpuMillis, subRequests: request.limits.subrequests },
            }
            const response = yield* Effect.tryPromise({
              try: () => {
                const workerFetch = options.loader
                  .load(code)
                  .getEntrypoint()
                  .fetch(
                    new Request("https://sandbox.generalist.invalid/execute", {
                      method: "POST",
                      signal: invocation.signal,
                      body: `{"protocolVersion":${JSON.stringify(request.protocolVersion)},"requestId":${JSON.stringify(request.requestId)},"input":${encodedInput}}`,
                    }),
                  )
                return raceAbort(workerFetch, invocation.signal)
              },
              catch: (cause) => loaderFailure(cause, request, deadlineElapsed),
            })
            const afterExecution = interruptionFailure(request, deadlineElapsed)
            if (afterExecution !== undefined) return yield* afterExecution
            const text = yield* Effect.tryPromise({
              try: () => readBounded(response, request.limits.outputBytes, invocation.signal),
              catch: (cause) => loaderFailure(cause, request, deadlineElapsed),
            })
            const afterOutput = interruptionFailure(request, deadlineElapsed)
            if (afterOutput !== undefined) return yield* afterOutput
            const result = yield* decodeWorkerResponse(response, text, request, capabilityFailures)
            const afterDecode = interruptionFailure(request, deadlineElapsed)
            if (afterDecode !== undefined) return yield* afterDecode
            return result
          }),
        )
      }),
  })
}

/** @experimental Construct an explicitly disabled Worker Loader boundary. */
export const makeUnavailable = (message = "Worker Loader is unavailable"): CodeExecutorService =>
  CodeExecutor.of({
    identity: declareIdentity({
      provider: "cloudflare",
      implementation: { name: "generalist/cloudflare/dynamic-workers", version: "1" },
      runtime: { name: "cloudflare-workers", version: "not-configured" },
      template: { name: "generalist-program-runner", version: protocolVersion },
      physicalIsolation: "none",
      persistence: "none",
      network: {
        posture: "none",
        enforcement: { status: "unenforced", reason: "Worker Loader is unavailable" },
      },
      limits: {
        deadlineMillis: { status: "unenforced", reason: "Worker Loader is unavailable" },
        cpuMillis: { status: "unenforced", reason: "Worker Loader is unavailable" },
        subrequests: { status: "unenforced", reason: "Worker Loader is unavailable" },
        outputBytes: { status: "unenforced", reason: "Worker Loader is unavailable" },
        filesystem: { status: "unenforced", reason: "Worker Loader is unavailable" },
        processes: { status: "unenforced", reason: "Worker Loader is unavailable" },
      },
      knownLimitations: [message],
    }),
    execute: () => SandboxUnavailable.make({ message }),
  })

/** @experimental Provide the Worker Loader CodeExecutor. */
export const layer = (options: Options): Layer.Layer<CodeExecutor> => Layer.succeed(CodeExecutor, make(options))

/** @experimental Provide an explicitly disabled Worker Loader boundary. */
export const layerUnavailable = (message?: string): Layer.Layer<CodeExecutor> =>
  Layer.succeed(CodeExecutor, makeUnavailable(message))

export type {
  CapabilityRpc,
  CapabilityRpcRequest,
  Fetcher,
  Options,
  WorkerCode,
  WorkerLoader,
  WorkerStub,
} from "./types.js"
