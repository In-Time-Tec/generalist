import {
  Config,
  Duration,
  Effect,
  FileSystem,
  Layer,
  PlatformError,
  Redacted,
  Schema,
  Scope,
  Stream,
  type Types,
} from "effect"
import { Headers, HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/unstable/http"
import { autoPause } from "../../../sandbox/auto-pause.js"
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

const apiUrl = "https://app.daytona.io/api"

const SandboxClass = Schema.Literals(["container", "linux-vm"])
/** @experimental Daytona sandbox class supported by this leaf. */
export type SandboxClass = typeof SandboxClass.Type

const SandboxResponse = Schema.Struct({
  id: Schema.String,
  toolboxProxyUrl: Schema.String,
  sandboxClass: SandboxClass,
  state: Schema.optionalKey(Schema.String),
})
const ExecuteResponse = Schema.Struct({
  result: Schema.String,
  exitCode: Schema.optionalKey(Schema.Int),
})
const ApiError = Schema.Struct({ message: Schema.String })

type Connection = typeof SandboxResponse.Type
interface CreateRequest {
  autoStopInterval: number
  autoPauseInterval: number
  buildInfo?: { readonly dockerfileContent: string }
  snapshot?: string
}
interface ExecuteRequest {
  readonly command: string
  cwd?: string
  envs?: Readonly<Record<string, string>>
  timeout?: number
}

/** @experimental Daytona hosted sandbox configuration. */
export interface Options {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  /** OCI image for containers; existing Daytona VM snapshot for `linux-vm`. */
  readonly image: string
  readonly sandboxClass: SandboxClass
  readonly autoPauseAfter?: Duration.Input
}

/** @experimental Resolved Daytona configuration used by recorded fixtures. */
export interface ProviderOptions extends Omit<Options, "apiKey"> {
  readonly apiKey: Redacted.Redacted<string>
}

const isolation = (sandboxClass: SandboxClass): "container" | "microvm" =>
  sandboxClass === "container" ? "container" : "microvm"

const unsupported = (operation: Unsupported["operation"], message: string): Unsupported =>
  Unsupported.make({ operation, message })

const message = (cause: unknown, fallback: string): string => (Error.isError(cause) ? cause.message : fallback)

const unavailable = (cause: unknown, fallback: string): Unavailable =>
  Unavailable.make({ message: message(cause, fallback) })

const executionFailed = (cause: unknown, fallback: string): ExecutionFailed =>
  ExecutionFailed.make({ message: message(cause, fallback), cause })

const platformFailure = (method: string, path: string, cause: unknown) =>
  PlatformError.systemError({
    _tag: "Unknown",
    module: "DaytonaFileSystem",
    method,
    pathOrDescriptor: path,
    description: message(cause, `Daytona ${method} failed`),
    cause,
  })

const decodeError = (response: HttpClientResponse.HttpClientResponse, fallback: string): Effect.Effect<string> =>
  response.json.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(ApiError)),
    Effect.map((error) => error.message),
    Effect.orElseSucceed(() => `${fallback} with HTTP ${response.status}`),
  )

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "Daytona exposes sandbox CPU capacity, not a per-command CPU limit"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(
      unsupported("limit:memory", "Daytona exposes sandbox memory capacity, not a per-command memory limit"),
    )
  return Effect.succeed(requested?.wallClock === undefined ? {} : { wallClock: requested.wallClock })
}

const shellQuote = (value: string): string => `'${value.replaceAll("'", `'"'"'`)}'`

const commandLine = (
  command: Extract<Parameters<SandboxService["start"]>[0], { readonly _tag: "Process" }>,
): string => {
  const invocation = [command.command, ...command.arguments].map(shellQuote).join(" ")
  return command.stdin === undefined ? invocation : `printf %s ${shellQuote(command.stdin)} | ${invocation}`
}

/** @experimental Construct the Daytona provider over Effect HttpClient. */
export const makeProvider = (
  options: ProviderOptions,
): Effect.Effect<SandboxProviderService, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const request = (prepared: HttpClientRequest.HttpClientRequest) =>
      prepared.pipe(
        HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(options.apiKey)}`),
        http.execute,
        Effect.mapError((cause) => unavailable(cause, "Daytona is unavailable")),
        Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "authorization"]),
      )

    const decodeSandbox = (response: HttpClientResponse.HttpClientResponse) =>
      Effect.gen(function* () {
        if (response.status < 200 || response.status >= 300) {
          const failure = yield* decodeError(response, "Daytona request failed")
          return yield* Unavailable.make({ message: failure })
        }
        const connection = yield* response.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(SandboxResponse)),
          Effect.mapError((cause) => unavailable(cause, "Daytona returned an invalid sandbox response")),
        )
        if (connection.sandboxClass !== options.sandboxClass)
          return yield* Unavailable.make({
            message: `Daytona returned ${connection.sandboxClass} for requested ${options.sandboxClass} sandbox`,
          })
        return connection
      })

    const connect = (id: string) =>
      HttpClientRequest.get(`${apiUrl}/sandbox/${encodeURIComponent(id)}`).pipe(request, Effect.flatMap(decodeSandbox))

    const create = Effect.gen(function* () {
      const body: Types.Mutable<CreateRequest> = { autoStopInterval: 0, autoPauseInterval: 0 }
      if (options.sandboxClass === "container") body.buildInfo = { dockerfileContent: `FROM ${options.image}\n` }
      else body.snapshot = options.image
      return yield* HttpClientRequest.post(`${apiUrl}/sandbox`).pipe(
        HttpClientRequest.bodyJsonUnsafe(body),
        request,
        Effect.flatMap(decodeSandbox),
      )
    })

    const sandbox = (connection: Connection, limits: Limits, scope: Scope.Scope, owned: boolean) =>
      Effect.gen(function* () {
        const lifecycle = (operation: "pause" | "start" | "stop") =>
          HttpClientRequest.post(`${apiUrl}/sandbox/${encodeURIComponent(connection.id)}/${operation}`).pipe(
            request,
            Effect.flatMap(decodeSandbox),
            Effect.asVoid,
          )
        const destroy = HttpClientRequest.delete(`${apiUrl}/sandbox/${encodeURIComponent(connection.id)}`).pipe(
          request,
          Effect.flatMap(decodeSandbox),
          Effect.asVoid,
        )
        let release = destroy
        if (!owned) release = options.sandboxClass === "linux-vm" ? lifecycle("pause") : lifecycle("stop")
        yield* Scope.addFinalizer(scope, release.pipe(Effect.ignore))

        const executeProcess = (process: ExecuteRequest): Effect.Effect<typeof ExecuteResponse.Type, SandboxError> => {
          const timeout = wallClockMillis(limits)
          if (timeout !== undefined) process.timeout = Math.max(1, Math.ceil(timeout / 1_000))
          const remote = HttpClientRequest.post(
            `${connection.toolboxProxyUrl.replace(/\/$/, "")}/${encodeURIComponent(connection.id)}/process/execute`,
          ).pipe(
            HttpClientRequest.bodyJsonUnsafe(process),
            request,
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status === 408 && timeout !== undefined)
                  return yield* LimitExceeded.make({ resource: "wall-clock", limit: timeout })
                if (response.status < 200 || response.status >= 300) {
                  const failure = yield* decodeError(response, "Daytona command failed")
                  if ([401, 404, 409, 429, 502, 503, 504].includes(response.status))
                    return yield* Unavailable.make({ message: failure })
                  return yield* ExecutionFailed.make({ message: failure })
                }
                return yield* response.json.pipe(
                  Effect.flatMap(Schema.decodeUnknownEffect(ExecuteResponse)),
                  Effect.mapError((cause) => executionFailed(cause, "Daytona returned an invalid command result")),
                )
              }),
            ),
          )
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
            executeProcess({ command: `mkdir -p -- ${shellQuote(path)}` }).pipe(
              Effect.flatMap((result) =>
                (result.exitCode ?? 0) === 0
                  ? Effect.void
                  : Effect.fail(platformFailure("makeDirectory", path, result.result)),
              ),
              Effect.mapError((cause) => platformFailure("makeDirectory", path, cause)),
            ),
          readFileString: (path) =>
            executeProcess({ command: `cat -- ${shellQuote(path)}` }).pipe(
              Effect.flatMap((result) =>
                (result.exitCode ?? 0) === 0
                  ? Effect.succeed(result.result)
                  : Effect.fail(platformFailure("readFileString", path, result.result)),
              ),
              Effect.mapError((cause) => platformFailure("readFileString", path, cause)),
            ),
          writeFileString: (path, data) =>
            executeProcess({
              command: `mkdir -p -- "$(dirname -- ${shellQuote(path)})" && printf %s ${shellQuote(data)} > ${shellQuote(path)}`,
            }).pipe(
              Effect.flatMap((result) =>
                (result.exitCode ?? 0) === 0
                  ? Effect.void
                  : Effect.fail(platformFailure("writeFileString", path, result.result)),
              ),
              Effect.mapError((cause) => platformFailure("writeFileString", path, cause)),
            ),
        })

        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
            return Effect.fail(unsupported(operation, `Daytona does not execute ${command._tag} commands`))
          }
          const process: ExecuteRequest = { command: commandLine(command) }
          if (command.cwd !== undefined) process.cwd = command.cwd
          if (command.environment !== undefined) process.envs = command.environment
          return Effect.cached(executeProcess(process)).pipe(
            Effect.map((shared) => ({
              events: Stream.unwrap(
                shared.pipe(
                  Effect.map((result) =>
                    result.result.length === 0
                      ? Stream.empty
                      : Stream.succeed({ _tag: "Output", channel: "stdout", text: result.result }),
                  ),
                ),
              ),
              result: shared.pipe(
                Effect.map((result) => ({ stdout: result.result, stderr: "", exitCode: result.exitCode ?? 0 })),
              ),
            })),
          )
        }

        const unavailableOperation = (operation: Unsupported["operation"]) =>
          Effect.fail(unsupported(operation, `Daytona ${options.sandboxClass} does not expose ${operation}`))
        const lifecycleSupported = options.sandboxClass === "linux-vm"
        return make({
          isolation: isolation(options.sandboxClass),
          limits,
          capabilities: {
            commands: ["Process"],
            files: true,
            pause: lifecycleSupported,
            resume: lifecycleSupported,
            snapshot: false,
            fork: false,
            limits: ["wall-clock"],
          },
          start,
          files: Effect.succeed(files),
          pause: lifecycleSupported ? lifecycle("pause") : unavailableOperation("pause"),
          resume: lifecycleSupported ? lifecycle("start") : unavailableOperation("resume"),
          snapshot: unavailableOperation("snapshot"),
          fork: () => unavailableOperation("fork"),
        })
      })

    const provider = SandboxProvider.of({
      defaultImage: options.image,
      acquire: (acquireOptions: AcquireOptions = {}) =>
        Effect.gen(function* () {
          if (acquireOptions.image !== undefined && acquireOptions.image !== options.image)
            return yield* Unavailable.make({
              message: `Daytona image ${acquireOptions.image} does not match configured image ${options.image}`,
            })
          const limits = yield* requestedLimits(acquireOptions.limits)
          const scope = yield* Scope.Scope
          const connection = acquireOptions.key === undefined ? yield* create : yield* connect(acquireOptions.key)
          return yield* sandbox(connection, limits, scope, acquireOptions.key === undefined)
        }),
    })
    return options.autoPauseAfter === undefined || options.sandboxClass === "container"
      ? provider
      : autoPause(provider, options.autoPauseAfter)
  })

/** @experimental Provide the hosted Daytona Sandbox leaf. */
export const layer = (options: Options): Layer.Layer<SandboxProvider, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(SandboxProvider, options.apiKey.pipe(Effect.flatMap((apiKey) => makeProvider({ ...options, apiKey }))))
