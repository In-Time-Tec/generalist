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
  Schema,
  Scope,
  Stream,
} from "effect"
import { Headers, HttpClient, HttpClientRequest, type HttpClientResponse } from "effect/unstable/http"
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

const apiUrl = "https://api.sprites.dev/v1"
const defaultImage = "fly-sprites:default"

const SpriteResponse = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  status: Schema.Literals(["cold", "warm", "running"]),
})

interface ProcessResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/** @experimental Fly Sprites hosted microVM configuration. */
export interface Options {
  readonly token: Config.Config<Redacted.Redacted<string>>
  /** Prefix for fresh Sprite names. Acquire keys address an exact existing Sprite name. */
  readonly app: string
}

/** @experimental Resolved Fly Sprites configuration used by recorded fixtures. */
export interface ProviderOptions extends Omit<Options, "token"> {
  readonly token: Redacted.Redacted<string>
}

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
    module: "FlySpritesFileSystem",
    method,
    pathOrDescriptor: path,
    description: message(cause, `Fly Sprites ${method} failed`),
    cause,
  })

const decodeError = (response: HttpClientResponse.HttpClientResponse, fallback: string): Effect.Effect<string> =>
  response.text.pipe(
    Effect.map((body) => (body.length === 0 ? `${fallback} with HTTP ${response.status}` : body)),
    Effect.orElseSucceed(() => `${fallback} with HTTP ${response.status}`),
  )

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "Fly Sprites does not expose a per-command CPU limit"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(unsupported("limit:memory", "Fly Sprites manages microVM memory capacity"))
  return Effect.succeed(requested?.wallClock === undefined ? {} : { wallClock: requested.wallClock })
}

const concat = (parts: ReadonlyArray<Uint8Array>): Uint8Array => {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 0))
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

const decodeProcess = (chunks: ReadonlyArray<Uint8Array>): Effect.Effect<ProcessResult, ExecutionFailed> =>
  Effect.gen(function* () {
    const stdout: Array<Uint8Array> = []
    const stderr: Array<Uint8Array> = []
    let exitCode: number | undefined
    for (const chunk of chunks) {
      if (chunk.length < 2) return yield* executionFailed(chunk, "Fly Sprites returned an empty process frame")
      const payload = chunk.subarray(1)
      switch (chunk[0]) {
        case 1:
          stdout.push(payload)
          break
        case 2:
          stderr.push(payload)
          break
        case 3:
          if (payload.length !== 1) return yield* executionFailed(chunk, "Fly Sprites returned an invalid exit frame")
          exitCode = payload[0]
          break
        default:
          return yield* executionFailed(chunk, "Fly Sprites returned an unknown process stream")
      }
    }
    if (exitCode === undefined)
      return yield* ExecutionFailed.make({ message: "Fly Sprites process stream ended without an exit frame" })
    return {
      stdout: new TextDecoder().decode(concat(stdout)),
      stderr: new TextDecoder().decode(concat(stderr)),
      exitCode,
    }
  })

/** @experimental Construct the Fly Sprites provider over Effect HttpClient. */
export const makeProvider = (
  options: ProviderOptions,
): Effect.Effect<SandboxProviderService, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const nextId = yield* Ref.make(0)
    const request = (prepared: HttpClientRequest.HttpClientRequest) =>
      prepared.pipe(
        HttpClientRequest.setHeader("authorization", `Bearer ${Redacted.value(options.token)}`),
        http.execute,
        Effect.mapError((cause) => unavailable(cause, "Fly Sprites is unavailable")),
        Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "authorization"]),
      )

    const decodeSprite = (response: HttpClientResponse.HttpClientResponse) =>
      response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(SpriteResponse)),
        Effect.mapError((cause) => unavailable(cause, "Fly Sprites returned an invalid Sprite response")),
      )

    const create = (name: string) =>
      HttpClientRequest.post(`${apiUrl}/sprites`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ name }),
        request,
        Effect.flatMap((response) =>
          response.status === 201
            ? decodeSprite(response)
            : decodeError(response, "Fly Sprites creation failed").pipe(
                Effect.flatMap((failure) => Effect.fail(Unavailable.make({ message: failure }))),
              ),
        ),
      )

    const connect = (name: string) =>
      HttpClientRequest.get(`${apiUrl}/sprites/${encodeURIComponent(name)}`).pipe(
        request,
        Effect.flatMap((response) =>
          response.status === 200
            ? decodeSprite(response)
            : decodeError(response, "Fly Sprite lookup failed").pipe(
                Effect.flatMap((failure) => Effect.fail(Unavailable.make({ message: failure }))),
              ),
        ),
      )

    const sandbox = (name: string, limits: Limits, scope: Scope.Scope, owned: boolean) =>
      Effect.gen(function* () {
        if (owned)
          yield* Scope.addFinalizer(
            scope,
            HttpClientRequest.delete(`${apiUrl}/sprites/${encodeURIComponent(name)}`).pipe(request, Effect.ignore),
          )

        const execute = (
          command: Extract<Parameters<SandboxService["start"]>[0], { readonly _tag: "Process" }>,
        ): Effect.Effect<ProcessResult, SandboxError> => {
          const params: Array<readonly [string, string]> = [
            ...[command.command, ...command.arguments].map((argument) => ["cmd", argument] as const),
            ["path", command.command],
          ]
          if (command.cwd !== undefined) params.push(["dir", command.cwd])
          if (command.environment !== undefined)
            for (const [key, value] of Object.entries(command.environment)) params.push(["env", `${key}=${value}`])
          let prepared = HttpClientRequest.post(`${apiUrl}/sprites/${encodeURIComponent(name)}/exec`).pipe(
            HttpClientRequest.setUrlParams(params),
          )
          if (command.stdin !== undefined) {
            params.push(["stdin", "true"])
            prepared = prepared.pipe(
              HttpClientRequest.setUrlParams(params),
              HttpClientRequest.bodyUint8Array(new TextEncoder().encode(command.stdin), "application/octet-stream"),
            )
          }
          const timeout = wallClockMillis(limits)
          const remote = prepared.pipe(
            request,
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status < 200 || response.status >= 300) {
                  const failure = yield* decodeError(response, "Fly Sprites command failed")
                  if ([401, 404, 429, 500, 502, 503, 504].includes(response.status))
                    return yield* Unavailable.make({ message: failure })
                  return yield* ExecutionFailed.make({ message: failure })
                }
                const chunks = yield* Stream.runCollect(response.stream).pipe(
                  Effect.mapError((cause) => executionFailed(cause, "Fly Sprites process response failed")),
                )
                return yield* decodeProcess(chunks)
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
            execute({ _tag: "Process", command: "mkdir", arguments: ["-p", "--", path] }).pipe(
              Effect.flatMap((result) =>
                result.exitCode === 0
                  ? Effect.void
                  : Effect.fail(platformFailure("makeDirectory", path, result.stderr)),
              ),
              Effect.mapError((cause) => platformFailure("makeDirectory", path, cause)),
            ),
          readFileString: (path) =>
            HttpClientRequest.get(`${apiUrl}/sprites/${encodeURIComponent(name)}/fs/read`).pipe(
              HttpClientRequest.setUrlParams({ path, workingDir: "/" }),
              request,
              Effect.flatMap((response) =>
                response.status === 200
                  ? response.text.pipe(Effect.mapError((cause) => platformFailure("readFileString", path, cause)))
                  : decodeError(response, "Fly Sprites file read failed").pipe(
                      Effect.flatMap((failure) => Effect.fail(platformFailure("readFileString", path, failure))),
                    ),
              ),
              Effect.mapError((cause) => platformFailure("readFileString", path, cause)),
            ),
          writeFileString: (path, data) =>
            HttpClientRequest.put(`${apiUrl}/sprites/${encodeURIComponent(name)}/fs/write`).pipe(
              HttpClientRequest.setUrlParams({ path, workingDir: "/", mkdirParents: true }),
              HttpClientRequest.bodyUint8Array(new TextEncoder().encode(data), "application/octet-stream"),
              request,
              Effect.flatMap((response) =>
                response.status === 200 || response.status === 201
                  ? Effect.void
                  : decodeError(response, "Fly Sprites file write failed").pipe(
                      Effect.flatMap((failure) => Effect.fail(platformFailure("writeFileString", path, failure))),
                    ),
              ),
              Effect.mapError((cause) => platformFailure("writeFileString", path, cause)),
            ),
        })

        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
            return Effect.fail(unsupported(operation, `Fly Sprites does not execute ${command._tag} commands`))
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
          Effect.fail(unsupported(operation, `Fly Sprites does not support ${operation}`))
        return make({
          isolation: "microvm",
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
      acquire: (acquireOptions: AcquireOptions = {}) =>
        Effect.gen(function* () {
          if (acquireOptions.image !== undefined && acquireOptions.image !== defaultImage)
            return yield* Unavailable.make({ message: `Fly Sprites does not support image ${acquireOptions.image}` })
          const limits = yield* requestedLimits(acquireOptions.limits)
          const scope = yield* Scope.Scope
          if (acquireOptions.key !== undefined) {
            const sprite = yield* connect(acquireOptions.key)
            return yield* sandbox(sprite.name, limits, scope, false)
          }
          const now = yield* Clock.currentTimeMillis
          const suffix = yield* Ref.updateAndGet(nextId, (value) => value + 1)
          const sprite = yield* create(`${options.app}-${now}-${suffix}`)
          return yield* sandbox(sprite.name, limits, scope, true)
        }),
    })
  })

/** @experimental Provide the hosted Fly Sprites microVM Sandbox leaf. */
export const layer = (options: Options): Layer.Layer<SandboxProvider, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(SandboxProvider, options.token.pipe(Effect.flatMap((token) => makeProvider({ ...options, token }))))
