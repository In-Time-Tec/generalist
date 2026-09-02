import {
  ClientClosedError,
  InternalFailure,
  type Image,
  ModalClient,
  NotFoundError,
  type Sandbox as ModalSandbox,
  type SandboxExecParams,
  SandboxTimeoutError,
  TimeoutError,
} from "modal"
import { Config, Duration, Effect, FileSystem, Layer, PlatformError, Redacted, Scope, Stream, type Types } from "effect"
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
  SnapshotNotFound,
  Unavailable,
  Unsupported,
  wallClockMillis,
} from "../../../sandbox/service.js"

interface ExecuteOptions {
  readonly cwd?: string
  readonly environment?: Readonly<Record<string, string>>
  readonly stdin?: string
  readonly timeoutMs?: number
}

interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** @experimental Minimal Modal SDK sandbox boundary used by recorded fixtures. */
export interface Connection {
  readonly id: string
  readonly execute: (command: ReadonlyArray<string>, options: ExecuteOptions) => Promise<ProcessResult>
  readonly makeDirectory: (path: string) => Promise<void>
  readonly readFile: (path: string) => Promise<string>
  readonly writeFile: (path: string, data: string) => Promise<void>
  readonly snapshot: () => Promise<string>
  readonly terminate: () => Promise<void>
  readonly detach: () => void
}

/** @experimental Minimal Modal SDK client boundary used by recorded fixtures. */
export interface Client {
  readonly create: (image: string, snapshot: boolean) => Promise<Connection>
  readonly connect: (id: string) => Promise<Connection>
  readonly close: () => void
}

/** @experimental Modal hosted container configuration. */
export interface Options {
  readonly tokenId: Config.Config<Redacted.Redacted<string>>
  readonly tokenSecret: Config.Config<Redacted.Redacted<string>>
  readonly app: string
  readonly image: string
}

/** @experimental Resolved Modal configuration used by recorded fixtures. */
export interface ProviderOptions extends Omit<Options, "tokenId" | "tokenSecret"> {
  readonly tokenId: Redacted.Redacted<string>
  readonly tokenSecret: Redacted.Redacted<string>
  readonly client: Client
}

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const message = (cause: unknown, fallback: string): string => (Error.isError(cause) ? cause.message : fallback)

const unavailable = (cause: unknown, fallback: string): Unavailable =>
  Unavailable.make({ message: message(cause, fallback) })

const executionFailure = (cause: unknown, timeout: number | undefined): SandboxError => {
  if (timeout !== undefined && (cause instanceof TimeoutError || cause instanceof SandboxTimeoutError))
    return LimitExceeded.make({ resource: "wall-clock", limit: timeout })
  const text = message(cause, "Modal command failed")
  if (cause instanceof InternalFailure || cause instanceof ClientClosedError || cause instanceof NotFoundError)
    return unavailable(cause, "Modal Sandbox is unavailable")
  if (/unauthenticated|permission denied|resource exhausted|capacity|unavailable|network|connect/iu.test(text))
    return unavailable(cause, "Modal Sandbox is unavailable")
  return ExecutionFailed.make({ message: text, cause })
}

const platformFailure = (method: string, path: string, cause: unknown) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "ModalFileSystem",
    method,
    pathOrDescriptor: path,
    description: message(cause, `Modal ${method} failed`),
    cause,
  })

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "Modal exposes CPU capacity, not a per-command CPU-time limit"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(
      unsupported("limit:memory", "Modal memory limits are sandbox capacity and cannot honor every requested MiB"),
    )
  return Effect.succeed(requested?.wallClock === undefined ? {} : { wallClock: requested.wallClock })
}

const sdkConnection = (sandbox: ModalSandbox): Connection => ({
  id: sandbox.sandboxId,
  execute: (command, options) => {
    const params: Types.Mutable<SandboxExecParams & { mode: "text" }> = { mode: "text" }
    if (options.cwd !== undefined) params.workdir = options.cwd
    if (options.environment !== undefined) params.env = { ...options.environment }
    if (options.timeoutMs !== undefined) params.timeoutMs = options.timeoutMs
    return sandbox.exec([...command], params).then((process) => {
      const stdin =
        options.stdin === undefined
          ? process.stdin.close()
          : process.stdin.writeText(options.stdin).then(() => process.stdin.close())
      return Promise.all([process.stdout.readText(), process.stderr.readText(), process.wait(), stdin]).then(
        ([stdout, stderr, exitCode]) => ({ stdout, stderr, exitCode }),
      )
    })
  },
  makeDirectory: (path) => sandbox.filesystem.makeDirectory(path),
  readFile: (path) => sandbox.filesystem.readText(path),
  writeFile: (path, data) => sandbox.filesystem.writeText(data, path),
  snapshot: () => sandbox.snapshotFilesystem().then((image) => image.imageId),
  terminate: () => sandbox.terminate(),
  detach: () => sandbox.detach(),
})

const sdkClient = (options: Omit<ProviderOptions, "client">): Client => {
  const modal = new ModalClient({
    tokenId: Redacted.value(options.tokenId),
    tokenSecret: Redacted.value(options.tokenSecret),
  })
  const app = modal.apps.fromName(options.app, { createIfMissing: true })
  const create = (imageId: string, snapshot: boolean) => {
    const image: Promise<Image> = snapshot
      ? modal.images.fromId(imageId)
      : Promise.resolve(modal.images.fromRegistry(imageId))
    return Promise.all([app, image])
      .then(([resolvedApp, resolvedImage]) => modal.sandboxes.create(resolvedApp, resolvedImage))
      .then(sdkConnection)
  }
  return {
    create,
    connect: (id) => modal.sandboxes.fromId(id).then(sdkConnection),
    close: () => modal.close(),
  }
}

/** @experimental Construct the Modal provider over an injected SDK client. */
export const makeProvider = (options: ProviderOptions): SandboxProviderService => {
  const client = options.client
  const sandbox = (
    connection: Connection,
    limits: Limits,
    scope: Scope.Scope,
    owned: boolean,
  ): Effect.Effect<SandboxService, never> =>
    Effect.gen(function* () {
      yield* Scope.addFinalizer(
        scope,
        owned
          ? Effect.tryPromise(() => connection.terminate()).pipe(Effect.ignore)
          : Effect.sync(() => connection.detach()),
      )
      const execute = (
        command: Extract<Parameters<SandboxService["start"]>[0], { readonly _tag: "Process" }>,
      ): Effect.Effect<ProcessResult, SandboxError> => {
        const timeout = wallClockMillis(limits)
        const executeOptions: Types.Mutable<ExecuteOptions> = {}
        if (command.cwd !== undefined) executeOptions.cwd = command.cwd
        if (command.environment !== undefined) executeOptions.environment = command.environment
        if (command.stdin !== undefined) executeOptions.stdin = command.stdin
        if (timeout !== undefined) executeOptions.timeoutMs = timeout
        const remote = Effect.tryPromise({
          try: () => connection.execute([command.command, ...command.arguments], executeOptions),
          catch: (cause) => executionFailure(cause, timeout),
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
            try: () => connection.makeDirectory(path),
            catch: (cause) => platformFailure("makeDirectory", path, cause),
          }),
        readFileString: (path) =>
          Effect.tryPromise({
            try: () => connection.readFile(path),
            catch: (cause) => platformFailure("readFileString", path, cause),
          }),
        writeFileString: (path, data) =>
          Effect.tryPromise({
            try: () => connection.writeFile(path, data),
            catch: (cause) => platformFailure("writeFileString", path, cause),
          }),
      })
      const start: SandboxService["start"] = (command) => {
        if (command._tag !== "Process") {
          const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
          return Effect.fail(unsupported(operation, `Modal does not execute ${command._tag} commands`))
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
        Effect.fail(unsupported(operation, `Modal does not support ${operation}`))
      return make({
        isolation: "container",
        limits,
        capabilities: {
          commands: ["Process"],
          files: true,
          pause: false,
          resume: false,
          snapshot: true,
          fork: true,
          limits: ["wall-clock"],
        },
        start,
        files: Effect.succeed(files),
        pause: unavailableOperation("pause"),
        resume: unavailableOperation("resume"),
        snapshot: Effect.tryPromise({
          try: () => connection.snapshot(),
          catch: (cause) => executionFailure(cause, undefined),
        }),
        fork: (snapshotId) =>
          Effect.tryPromise({
            try: () => client.create(snapshotId, true),
            catch: (cause) =>
              cause instanceof NotFoundError
                ? SnapshotNotFound.make({ snapshotId })
                : unavailable(cause, "Modal could not restore the snapshot"),
          }).pipe(Effect.flatMap((forked) => sandbox(forked, limits, scope, true))),
      })
    })

  return SandboxProvider.of({
    defaultImage: options.image,
    acquire: (request: AcquireOptions = {}) =>
      Effect.gen(function* () {
        if (request.image !== undefined && request.image !== options.image)
          return yield* Unavailable.make({
            message: `Modal image ${request.image} does not match configured image ${options.image}`,
          })
        const limits = yield* requestedLimits(request.limits)
        const scope = yield* Scope.Scope
        const connection = yield* Effect.tryPromise({
          try: () => (request.key === undefined ? client.create(options.image, false) : client.connect(request.key)),
          catch: (cause) => unavailable(cause, "Modal Sandbox acquisition failed"),
        })
        return yield* sandbox(connection, limits, scope, request.key === undefined)
      }),
  })
}

/** @experimental Provide the hosted Modal container Sandbox leaf. */
export const layer = (options: Options): Layer.Layer<SandboxProvider, Config.ConfigError> =>
  Layer.effect(
    SandboxProvider,
    Effect.gen(function* () {
      const tokenId = yield* options.tokenId
      const tokenSecret = yield* options.tokenSecret
      const resolved = { ...options, tokenId, tokenSecret }
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => sdkClient(resolved)),
        (current) => Effect.sync(() => current.close()),
      )
      return makeProvider({ ...resolved, client })
    }),
  )
