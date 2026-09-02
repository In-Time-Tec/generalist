import { Clock, Duration, Effect, FileSystem, Layer, PlatformError, Ref, Schema, Scope, Stream } from "effect"
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

const ExecResponse = Schema.Struct({
  success: Schema.Boolean,
  exitCode: Schema.Int,
  stdout: Schema.String,
  stderr: Schema.String,
  command: Schema.String,
  duration: Schema.Finite,
  timestamp: Schema.String,
  sessionId: Schema.optionalKey(Schema.String),
})
const ReadFileResponse = Schema.Struct({
  success: Schema.Boolean,
  path: Schema.String,
  content: Schema.String,
  timestamp: Schema.String,
})
const SuccessResponse = Schema.Struct({ success: Schema.Boolean, path: Schema.String })

/** @experimental Options passed to Cloudflare Sandbox command execution. */
export interface ExecOptions {
  signal: AbortSignal
  cwd?: string
  env?: Readonly<Record<string, string>>
  timeout?: number
}

/** @experimental Cloudflare Sandbox Durable Object RPC surface used by Generalist. */
export interface SandboxStub {
  exec(command: string, options: ExecOptions): Promise<typeof ExecResponse.Encoded>
  mkdir(path: string, options?: { readonly recursive: boolean }): Promise<typeof SuccessResponse.Encoded>
  readFile(path: string, options: { readonly encoding: "utf-8" }): Promise<typeof ReadFileResponse.Encoded>
  writeFile(
    path: string,
    data: string,
    options: { readonly encoding: "utf-8" },
  ): Promise<typeof SuccessResponse.Encoded>
  destroy(): Promise<void>
}

/** @experimental Structural Cloudflare Durable Object namespace accepted by the leaf. */
export interface SandboxBinding<Id> {
  idFromName(name: string): Id
  get(id: Id): SandboxStub
}

/** @experimental Cloudflare Sandbox binding configuration. */
export interface Options<Id> {
  readonly binding: SandboxBinding<Id>
}

/** @experimental Resolved Cloudflare Sandbox factory used by the provider and recorded fixtures. */
export interface ProviderOptions {
  readonly getSandbox: (id: string) => SandboxStub
}

const defaultImage = "cloudflare:sandbox"

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const errorMessage = (cause: unknown, fallback: string): string => (Error.isError(cause) ? cause.message : fallback)

const errorCode = (cause: unknown): string | undefined => {
  const decoded = Schema.decodeUnknownOption(Schema.Struct({ code: Schema.String }))(cause)
  return decoded._tag === "Some" ? decoded.value.code : undefined
}

const commandFailure = (cause: unknown, limits: Limits): SandboxError => {
  const code = errorCode(cause)
  const wallClock = wallClockMillis(limits)
  const timedOut = Error.isError(cause) && cause.message.toLowerCase().includes("timeout")
  if (wallClock !== undefined && (code === "COMMAND_TIMEOUT" || code === "PROCESS_TIMEOUT" || timedOut))
    return LimitExceeded.make({ resource: "wall-clock", limit: wallClock })
  if (code === "CONTAINER_UNAVAILABLE" || code === "RPC_TRANSPORT_ERROR")
    return Unavailable.make({ message: errorMessage(cause, "Cloudflare Sandbox is unavailable") })
  return ExecutionFailed.make({ message: errorMessage(cause, "Cloudflare Sandbox command failed"), cause })
}

const platformFailure = (method: string, path: string, cause: unknown) =>
  PlatformError.systemError({
    _tag: errorCode(cause) === "FILE_NOT_FOUND" ? "NotFound" : "Unknown",
    module: "CloudflareSandboxFileSystem",
    method,
    pathOrDescriptor: path,
    description: errorMessage(cause, `Cloudflare Sandbox ${method} failed`),
    cause,
  })

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "Cloudflare Sandbox does not expose a per-command CPU limit"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(unsupported("limit:memory", "Cloudflare Sandbox size is configured on its Container class"))
  return Effect.succeed(requested?.wallClock === undefined ? {} : { wallClock: requested.wallClock })
}

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`

const commandLine = (
  command: Extract<Parameters<SandboxService["start"]>[0], { readonly _tag: "Process" }>,
): string => {
  const invocation = [command.command, ...command.arguments].map(shellQuote).join(" ")
  return command.stdin === undefined ? invocation : `printf %s ${shellQuote(command.stdin)} | ${invocation}`
}

/** @experimental Construct the Cloudflare Container Sandbox provider. */
export const makeProvider = (options: ProviderOptions): Effect.Effect<SandboxProviderService> =>
  Effect.gen(function* () {
    const nextId = yield* Ref.make(0)

    const sandbox = (id: string, limits: Limits, scope: Scope.Scope) =>
      Effect.gen(function* () {
        const remote = yield* Effect.try({
          try: () => options.getSandbox(id),
          catch: (cause) => Unavailable.make({ message: errorMessage(cause, "Cloudflare Sandbox acquisition failed") }),
        })
        yield* Scope.addFinalizer(scope, Effect.promise(() => remote.destroy()).pipe(Effect.ignore))

        const files = FileSystem.makeNoop({
          makeDirectory: (path, fileOptions) =>
            Effect.tryPromise({
              try: () =>
                remote.mkdir(
                  path,
                  fileOptions?.recursive === undefined ? undefined : { recursive: fileOptions.recursive },
                ),
              catch: (cause) => platformFailure("makeDirectory", path, cause),
            }).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(SuccessResponse)),
              Effect.mapError((cause) => platformFailure("makeDirectory", path, cause)),
              Effect.asVoid,
            ),
          readFileString: (path) =>
            Effect.tryPromise({
              try: () => remote.readFile(path, { encoding: "utf-8" }),
              catch: (cause) => platformFailure("readFileString", path, cause),
            }).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(ReadFileResponse)),
              Effect.mapError((cause) => platformFailure("readFileString", path, cause)),
              Effect.map((response) => response.content),
            ),
          writeFileString: (path, data) =>
            Effect.tryPromise({
              try: () => remote.writeFile(path, data, { encoding: "utf-8" }),
              catch: (cause) => platformFailure("writeFileString", path, cause),
            }).pipe(
              Effect.flatMap(Schema.decodeUnknownEffect(SuccessResponse)),
              Effect.mapError((cause) => platformFailure("writeFileString", path, cause)),
              Effect.asVoid,
            ),
        })

        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
            return Effect.fail(unsupported(operation, `Cloudflare Sandbox does not execute ${command._tag} commands`))
          }
          const timeout = wallClockMillis(limits)
          const request = Effect.tryPromise({
            try: (signal) => {
              const execOptions: ExecOptions = { signal }
              if (command.cwd !== undefined) execOptions.cwd = command.cwd
              if (command.environment !== undefined) execOptions.env = command.environment
              if (timeout !== undefined) execOptions.timeout = timeout
              return remote.exec(commandLine(command), execOptions)
            },
            catch: (cause) => commandFailure(cause, limits),
          })
          const execute = (
            timeout === undefined
              ? request
              : request.pipe(
                  Effect.timeoutOrElse({
                    duration: Duration.millis(timeout),
                    orElse: () => Effect.fail(LimitExceeded.make({ resource: "wall-clock", limit: timeout })),
                  }),
                )
          ).pipe(
            Effect.flatMap(Schema.decodeUnknownEffect(ExecResponse)),
            Effect.mapError(
              (cause): SandboxError =>
                Schema.is(ExecutionFailed)(cause) || Schema.is(LimitExceeded)(cause) || Schema.is(Unavailable)(cause)
                  ? cause
                  : ExecutionFailed.make({ message: "Cloudflare Sandbox returned an invalid command result", cause }),
            ),
          )
          return Effect.cached(execute).pipe(
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
              result: shared.pipe(
                Effect.map((result) => ({
                  stdout: result.stdout,
                  stderr: result.stderr,
                  exitCode: result.exitCode,
                })),
              ),
            })),
          )
        }

        const unavailableOperation = (operation: Unsupported["operation"]) =>
          Effect.fail(unsupported(operation, `Cloudflare Sandbox does not support ${operation}`))
        return make({
          isolation: "container",
          limits,
          capabilities: {
            commands: ["Process"],
            files: true,
            pause: false,
            resume: false,
            snapshot: false,
            fork: false,
            limits: ["wall-clock"],
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
            return yield* Unavailable.make({
              message: `Cloudflare Sandbox image ${request.image} does not match deployment image ${defaultImage}`,
            })
          const limits = yield* requestedLimits(request.limits)
          const scope = yield* Scope.Scope
          const id =
            request.key ?? `${yield* Clock.currentTimeMillis}-${yield* Ref.updateAndGet(nextId, (value) => value + 1)}`
          return yield* sandbox(id, limits, scope)
        }),
    })
  })

/** @experimental Provide the hosted Cloudflare Container Sandbox leaf. */
export const layer = <Id>(options: Options<Id>): Layer.Layer<SandboxProvider> => {
  const getSandbox = (id: string) => options.binding.get(options.binding.idFromName(id))
  return Layer.effect(SandboxProvider, makeProvider({ getSandbox }))
}
