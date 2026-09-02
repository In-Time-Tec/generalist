import { createClient, type ActorHandle, type AnyActorDefinition, RivetError } from "@rivet-dev/agentos/client"
import {
  Clock,
  Config,
  Duration,
  Effect,
  FileSystem,
  Layer,
  PlatformError,
  Redacted,
  Ref,
  Scope,
  Stream,
  type Types,
} from "effect"
import {
  type AcquireOptions,
  ExecutionFailed,
  type Limits,
  LimitExceeded,
  make,
  type SandboxError,
  type SandboxProviderService,
  SandboxProvider,
  type SandboxService,
  Unavailable,
  Unsupported,
  wallClockMillis,
} from "../../../sandbox/service.js"

interface ExecOptions {
  readonly cwd?: string
  readonly env?: Readonly<Record<string, string>>
  readonly stdin?: string
  readonly timeout?: number
  readonly cpuTimeLimitMs?: number
  readonly captureStdio: true
}

interface ExecResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** @experimental Minimal agentOS actor boundary used by recorded fixtures. */
export interface Actor {
  readonly health: () => Promise<void>
  readonly destroy: () => Promise<void>
  readonly execute: (command: string, arguments_: ReadonlyArray<string>, options: ExecOptions) => Promise<ExecResult>
  readonly makeDirectory: (path: string) => Promise<void>
  readonly readFile: (path: string) => Promise<Uint8Array>
  readonly writeFile: (path: string, data: string) => Promise<void>
}

/** @experimental Minimal RivetKit client boundary used by recorded fixtures. */
export interface Client {
  readonly create: (name: string, key: string) => Promise<Actor>
  readonly get: (name: string, key: string) => Actor
  readonly close: () => Promise<void>
}

/** @experimental agentOS actor sandbox configuration. */
export interface Options {
  readonly endpoint: string
  readonly token: Config.Config<Redacted.Redacted<string>>
  /** Actor name registered by the agentOS host. */
  readonly actor?: string
}

/** @experimental Resolved agentOS configuration used by recorded fixtures. */
export interface ProviderOptions extends Omit<Options, "token"> {
  readonly token: Redacted.Redacted<string>
  readonly client: Client
}

const defaultImage = "agentos:actor"
const defaultActor = "agent-os"

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const message = (cause: unknown, fallback: string): string => (Error.isError(cause) ? cause.message : fallback)

const unavailable = (cause: unknown, fallback: string): Unavailable =>
  Unavailable.make({ message: message(cause, fallback) })

const executionFailure = (cause: unknown, limits: Limits): SandboxError => {
  const failure = RivetError.isRivetError(cause) ? cause.statusCode : undefined
  if (
    failure === 401 ||
    failure === 403 ||
    failure === 404 ||
    failure === 409 ||
    failure === 429 ||
    failure === 502 ||
    failure === 503 ||
    failure === 504
  )
    return unavailable(cause, "agentOS actor is unavailable")
  const text = message(cause, "agentOS command failed")
  if (/unauthenticated|permission denied|capacity|unavailable|network|fetch failed|connect/iu.test(text))
    return unavailable(cause, "agentOS actor is unavailable")
  if (limits.cpuMs !== undefined && /cpu.{0,20}(limit|time)/iu.test(text))
    return LimitExceeded.make({ resource: "cpu", limit: limits.cpuMs })
  const timeout = wallClockMillis(limits)
  if (timeout !== undefined && /timed?\s*out|timeout/iu.test(text))
    return LimitExceeded.make({ resource: "wall-clock", limit: timeout })
  return ExecutionFailed.make({ message: text, cause })
}

const platformFailure = (method: string, path: string, cause: unknown) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "AgentOSFileSystem",
    method,
    pathOrDescriptor: path,
    description: message(cause, `agentOS ${method} failed`),
    cause,
  })

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.memoryMb !== undefined)
    return Effect.fail(unsupported("limit:memory", "agentOS does not expose a per-actor memory limit"))
  const limits: Types.Mutable<Limits> = {}
  if (requested?.cpuMs !== undefined) limits.cpuMs = requested.cpuMs
  if (requested?.wallClock !== undefined) limits.wallClock = requested.wallClock
  return Effect.succeed(limits)
}

const wrap = (handle: ActorHandle<AnyActorDefinition>): Actor => ({
  health: () => handle.action({ name: "health", args: [] }).then(() => undefined),
  destroy: () => handle.action({ name: "destroy", args: [] }),
  execute: (command, arguments_, options) =>
    handle.action({ name: "execArgv", args: [command, [...arguments_], options] }),
  makeDirectory: (path) => handle.action({ name: "mkdir", args: [path, { recursive: true }] }),
  readFile: (path) => handle.action({ name: "readFile", args: [path] }),
  writeFile: (path, data) => handle.action({ name: "writeFile", args: [path, data] }),
})

const sdkClient = (options: Omit<ProviderOptions, "client">): Client => {
  const client = createClient({ endpoint: options.endpoint, token: Redacted.value(options.token) })
  return {
    create: (name, key) => client.create(name, key).then(wrap),
    get: (name, key) => wrap(client.get(name, key)),
    close: () => client.dispose(),
  }
}

/** @experimental Construct the agentOS provider over an injected public RivetKit client. */
export const makeProvider = (options: ProviderOptions): Effect.Effect<SandboxProviderService> =>
  Effect.gen(function* () {
    const client = options.client
    const nextId = yield* Ref.make(0)
    const actorName = options.actor ?? defaultActor
    const sandbox = (actor: Actor, limits: Limits, scope: Scope.Scope, owned: boolean) =>
      Effect.gen(function* () {
        if (owned) yield* Scope.addFinalizer(scope, Effect.tryPromise(() => actor.destroy()).pipe(Effect.ignore))
        const execute = (
          command: Extract<Parameters<SandboxService["start"]>[0], { readonly _tag: "Process" }>,
        ): Effect.Effect<ExecResult, SandboxError> => {
          const timeout = wallClockMillis(limits)
          const execOptions: Types.Mutable<ExecOptions> = { captureStdio: true }
          if (command.cwd !== undefined) execOptions.cwd = command.cwd
          if (command.environment !== undefined) execOptions.env = command.environment
          if (command.stdin !== undefined) execOptions.stdin = command.stdin
          if (timeout !== undefined) execOptions.timeout = timeout
          if (limits.cpuMs !== undefined) execOptions.cpuTimeLimitMs = limits.cpuMs
          const remote = Effect.tryPromise({
            try: () => actor.execute(command.command, command.arguments, execOptions),
            catch: (cause) => executionFailure(cause, limits),
          })
          return timeout === undefined
            ? remote
            : remote.pipe(
                Effect.timeoutOrElse({
                  duration: Duration.millis(timeout),
                  orElse: () => Effect.fail(LimitExceeded.make({ resource: "wall-clock", limit: timeout })),
                }),
              )
        }
        const files = FileSystem.makeNoop({
          makeDirectory: (path) =>
            Effect.tryPromise({
              try: () => actor.makeDirectory(path),
              catch: (cause) => platformFailure("makeDirectory", path, cause),
            }),
          readFileString: (path) =>
            Effect.tryPromise({
              try: () => actor.readFile(path),
              catch: (cause) => platformFailure("readFileString", path, cause),
            }).pipe(Effect.map((bytes) => new TextDecoder().decode(bytes))),
          writeFileString: (path, data) =>
            Effect.tryPromise({
              try: () => actor.writeFile(path, data),
              catch: (cause) => platformFailure("writeFileString", path, cause),
            }),
        })
        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
            return Effect.fail(unsupported(operation, `agentOS does not execute ${command._tag} commands`))
          }
          return Effect.cached(execute(command)).pipe(
            Effect.map((shared) => ({
              events: Stream.unwrap(
                shared.pipe(
                  Effect.map((result) =>
                    Stream.fromIterable([
                      ...(result.stdout.length === 0
                        ? []
                        : [{ _tag: "Output" as const, channel: "stdout" as const, text: result.stdout }]),
                      ...(result.stderr.length === 0
                        ? []
                        : [{ _tag: "Output" as const, channel: "stderr" as const, text: result.stderr }]),
                    ]),
                  ),
                ),
              ),
              result: shared,
            })),
          )
        }
        const unavailableOperation = (operation: Unsupported["operation"]) =>
          Effect.fail(unsupported(operation, `agentOS does not support ${operation}`))
        return make({
          isolation: "v8-isolate",
          limits,
          capabilities: {
            commands: ["Process"],
            files: true,
            pause: false,
            resume: false,
            snapshot: false,
            fork: false,
            limits: ["cpu", "wall-clock"],
          },
          start,
          files: Effect.succeed(files),
          pause: unavailableOperation("pause"),
          resume: unavailableOperation("resume"),
          snapshot: unavailableOperation("snapshot"),
          fork: () => unavailableOperation("fork"),
        })
      })

    return SandboxProvider.of({
      defaultImage,
      acquire: (request: AcquireOptions = {}) =>
        Effect.gen(function* () {
          if (request.image !== undefined && request.image !== defaultImage)
            return yield* Unavailable.make({ message: `agentOS does not support image ${request.image}` })
          const limits = yield* requestedLimits(request.limits)
          const scope = yield* Scope.Scope
          if (request.key !== undefined) {
            const actor = client.get(actorName, request.key)
            yield* Effect.tryPromise({
              try: () => actor.health(),
              catch: (cause) => unavailable(cause, "agentOS actor acquisition failed"),
            })
            return yield* sandbox(actor, limits, scope, false)
          }
          const now = yield* Clock.currentTimeMillis
          const suffix = yield* Ref.updateAndGet(nextId, (value) => value + 1)
          const actor = yield* Effect.tryPromise({
            try: () => client.create(actorName, `generalist-${now}-${suffix}`),
            catch: (cause) => unavailable(cause, "agentOS actor creation failed"),
          })
          return yield* sandbox(actor, limits, scope, true)
        }),
    })
  })

/** @experimental Provide the hosted agentOS V8-isolate Sandbox leaf. */
export const layer = (options: Options): Layer.Layer<SandboxProvider, Config.ConfigError> =>
  Layer.effect(
    SandboxProvider,
    Effect.gen(function* () {
      const token = yield* options.token
      const resolved = { ...options, token }
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => sdkClient(resolved)),
        (current) => Effect.promise(() => current.close()),
      )
      return yield* makeProvider({ ...resolved, client })
    }),
  )
