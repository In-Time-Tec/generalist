import { Clock, Duration, Effect, Layer, Schema } from "effect"
import {
  CodeExecutor,
  declareIdentity,
  ExecutionFailure,
  type ExecutionFailure as ExecutionFailureType,
  protocolVersion,
  Result,
  SandboxExecutionFailure,
  SandboxResourceExceeded,
  SandboxUnavailable,
  type Service as CodeExecutorService,
} from "../../core/program/code-executor.js"
import { ProgramCapabilities } from "../../core/program/capabilities.js"
import { identity } from "./identity.js"
import { ExecutionFailed, LimitExceeded, makeWorkerLoaderProvider, type SandboxError } from "../../sandbox/index.js"
import type { Options } from "./types.js"

const codeExecutorFailure = (failure: SandboxError): ExecutionFailureType => {
  if (Schema.is(ExecutionFailed)(failure) && Schema.is(ExecutionFailure)(failure.cause)) return failure.cause
  if (Schema.is(LimitExceeded)(failure)) {
    if (failure.resource === "cpu") {
      return SandboxResourceExceeded.make({ resource: "cpu", limit: failure.limit })
    }
    return SandboxExecutionFailure.make({ message: `sandbox ${failure.resource} limit ${failure.limit} exceeded` })
  }
  if (failure._tag === "generalist/sandbox/Unavailable") {
    return SandboxUnavailable.make({ message: failure.message })
  }
  return SandboxExecutionFailure.make({ message: "Worker Loader sandbox contract failed" })
}

/** @experimental Construct a production CodeExecutor as a thin Worker Loader Sandbox adapter. */
export const make = (options: Options): CodeExecutorService => {
  const provider = makeWorkerLoaderProvider(options)
  return CodeExecutor.of({
    identity: identity(options.compatibilityDate),
    execute: (request) =>
      Effect.gen(function* () {
        const capabilities = yield* ProgramCapabilities
        const now = yield* Clock.currentTimeMillis
        const sandbox = yield* provider
          .acquire({
            limits: {
              cpuMs: request.limits.cpuMillis,
              wallClock: Duration.millis(Math.max(1, request.deadlineMillis - now)),
            },
          })
          .pipe(Effect.mapError(codeExecutorFailure))
        const result = yield* sandbox
          .exec({ _tag: "JavaScriptModule", request, capabilities })
          .pipe(Effect.mapError(codeExecutorFailure))
        return yield* Schema.decodeUnknownEffect(Result)(result.value).pipe(
          Effect.mapError(() => SandboxExecutionFailure.make({ message: "Worker Loader returned no typed result" })),
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
