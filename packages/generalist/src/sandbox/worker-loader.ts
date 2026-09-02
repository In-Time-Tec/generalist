import { Clock, Effect, Layer, Schema, Stream } from "effect"
import { execute as executeWorker } from "../cloudflare/dynamic-workers/execution.js"
import type { Options as DynamicWorkerOptions } from "../cloudflare/dynamic-workers/types.js"
import { SandboxDeadlineExceeded, SandboxResourceExceeded } from "../core/program/code-executor.js"
import {
  type AcquireOptions,
  ExecutionFailed,
  type Limits,
  LimitExceeded,
  make,
  type SandboxProviderService,
  SandboxProvider,
  type SandboxService,
  Unavailable,
  Unsupported,
  wallClockMillis,
} from "./service.js"

/** @experimental Worker Loader sandbox configuration and optional provider-wide maximums. */
export interface WorkerLoaderOptions extends DynamicWorkerOptions {
  readonly image?: string
  readonly limits?: Limits
}

const defaultImage = (options: WorkerLoaderOptions): string =>
  options.image ?? `cloudflare-workers:${options.compatibilityDate}`

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const mergeLimits = (
  configured: Limits,
  requested: Limits | undefined,
): Effect.Effect<Limits, LimitExceeded | Unsupported> => {
  const request = requested ?? {}
  if (configured.memoryMb !== undefined || request.memoryMb !== undefined) {
    return Effect.fail(unsupported("limit:memory", "Worker Loader does not expose a per-isolate memory limit"))
  }
  if (configured.cpuMs !== undefined && request.cpuMs !== undefined && request.cpuMs > configured.cpuMs) {
    return Effect.fail(LimitExceeded.make({ resource: "cpu", limit: configured.cpuMs }))
  }
  const maximumWallClock = wallClockMillis(configured)
  const requestedWallClock = wallClockMillis(request)
  if (maximumWallClock !== undefined && requestedWallClock !== undefined && requestedWallClock > maximumWallClock) {
    return Effect.fail(LimitExceeded.make({ resource: "wall-clock", limit: maximumWallClock }))
  }
  const limits: Limits = {}
  const cpuMs = request.cpuMs ?? configured.cpuMs
  const wallClock = request.wallClock ?? configured.wallClock
  if (cpuMs !== undefined) Object.assign(limits, { cpuMs })
  if (wallClock !== undefined) Object.assign(limits, { wallClock })
  return Effect.succeed(limits)
}

const failureMessage = (cause: unknown): string =>
  Error.isError(cause) ? cause.message : "Worker Loader execution failed"

const executionFailure = (cause: unknown, limits: Limits): ExecutionFailed | LimitExceeded => {
  if (Schema.is(SandboxDeadlineExceeded)(cause)) {
    const wallClock = wallClockMillis(limits)
    if (wallClock !== undefined) return LimitExceeded.make({ resource: "wall-clock", limit: wallClock })
  }
  if (Schema.is(SandboxResourceExceeded)(cause) && cause.resource === "cpu") {
    return LimitExceeded.make({ resource: "cpu", limit: cause.limit })
  }
  return ExecutionFailed.make({ message: failureMessage(cause), cause })
}

const sandbox = (options: WorkerLoaderOptions, limits: Limits): SandboxService => {
  const start: SandboxService["start"] = (command) => {
    if (command._tag !== "JavaScriptModule") {
      const operation = command._tag === "Process" ? "exec:process" : "exec:typescript"
      return Effect.fail(unsupported(operation, `Worker Loader does not execute ${command._tag} commands`))
    }
    const result = Effect.gen(function* () {
      if (limits.cpuMs !== undefined && command.request.limits.cpuMillis > limits.cpuMs) {
        return yield* LimitExceeded.make({ resource: "cpu", limit: limits.cpuMs })
      }
      const wallClock = wallClockMillis(limits)
      if (wallClock !== undefined) {
        const now = yield* Clock.currentTimeMillis
        if (command.request.deadlineMillis - now > wallClock) {
          return yield* LimitExceeded.make({ resource: "wall-clock", limit: wallClock })
        }
      }
      const value = yield* executeWorker({
        options,
        request: command.request,
        capabilities: command.capabilities,
      }).pipe(Effect.mapError((cause) => executionFailure(cause, limits)))
      return { stdout: "", stderr: "", exitCode: 0, value }
    })
    return Effect.succeed({ events: Stream.empty, result })
  }
  const unavailable = (operation: Unsupported["operation"]): Effect.Effect<never, Unsupported> =>
    Effect.fail(unsupported(operation, `Worker Loader does not support ${operation}`))
  return make({
    isolation: "v8-isolate",
    limits,
    capabilities: {
      commands: ["JavaScriptModule"],
      files: false,
      pause: false,
      resume: false,
      snapshot: false,
      fork: false,
      limits: ["cpu", "wall-clock"],
    },
    start,
    files: unavailable("files"),
    pause: unavailable("pause"),
    resume: unavailable("resume"),
    snapshot: unavailable("snapshot"),
    fork: () => unavailable("fork"),
  })
}

/** @experimental Construct the v8-isolate Worker Loader Sandbox provider. */
export const makeWorkerLoaderProvider = (options: WorkerLoaderOptions): SandboxProviderService => {
  const image = defaultImage(options)
  const configuredLimits = options.limits ?? {}
  return SandboxProvider.of({
    defaultImage: image,
    acquire: (request: AcquireOptions = {}) => {
      if (request.image !== undefined && request.image !== image) {
        return Effect.fail(
          Unavailable.make({ message: `Worker Loader image ${request.image} does not match ${image}` }),
        )
      }
      return mergeLimits(configuredLimits, request.limits).pipe(Effect.map((limits) => sandbox(options, limits)))
    },
  })
}

/** @experimental Provide the v8-isolate Worker Loader Sandbox leaf. */
export const layerWorkerLoader = (options: WorkerLoaderOptions): Layer.Layer<SandboxProvider> =>
  Layer.succeed(SandboxProvider, makeWorkerLoaderProvider(options))
