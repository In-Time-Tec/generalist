import {
  Config,
  Duration,
  Effect,
  Encoding,
  FileSystem,
  Layer,
  PlatformError,
  Redacted,
  Ref,
  Result,
  Schema,
  Scope,
  Stream,
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
  SnapshotNotFound,
  Unavailable,
  Unsupported,
  wallClockMillis,
} from "../../../sandbox/service.js"

const apiUrl = "https://api.e2b.app"
const sandboxUrl = "https://sandbox.e2b.app"
const envdPort = "49983"
const sandboxTimeoutSeconds = 300

const SandboxResponse = Schema.Struct({
  sandboxID: Schema.String,
  templateID: Schema.String,
  clientID: Schema.String,
  envdVersion: Schema.String,
  envdAccessToken: Schema.optionalKey(Schema.NullOr(Schema.String)),
})

const SnapshotResponse = Schema.Struct({ snapshotID: Schema.String, names: Schema.Array(Schema.String) })
const ApiError = Schema.Struct({
  code: Schema.Int,
  message: Schema.String,
  error_code: Schema.optionalKey(Schema.String),
})
const ProcessEvent = Schema.Union([
  Schema.Struct({ start: Schema.Struct({ pid: Schema.Int }) }),
  Schema.Struct({ keepalive: Schema.Struct({}) }),
  Schema.Struct({
    data: Schema.Union([
      Schema.Struct({ stdout: Schema.String }),
      Schema.Struct({ stderr: Schema.String }),
      Schema.Struct({ pty: Schema.String }),
    ]),
  }),
  Schema.Struct({
    end: Schema.Struct({
      exitCode: Schema.optionalKey(Schema.Int),
      exited: Schema.Boolean,
      status: Schema.String,
      error: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  }),
])
const StartResponse = Schema.Struct({ event: ProcessEvent })
const StartRequest = Schema.Struct({
  process: Schema.Struct({
    cmd: Schema.String,
    args: Schema.Array(Schema.String),
    cwd: Schema.optionalKey(Schema.String),
    envs: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  stdin: Schema.Boolean,
})
const ConnectEnd = Schema.Struct({
  error: Schema.optionalKey(
    Schema.Struct({
      code: Schema.String,
      message: Schema.String,
      details: Schema.optionalKey(Schema.Array(Schema.Unknown)),
    }),
  ),
})

type Connection = typeof SandboxResponse.Type
interface ProcessRequest {
  readonly cmd: string
  readonly args: ReadonlyArray<string>
  cwd?: string
  envs?: Readonly<Record<string, string>>
}

const connectBody = (request: Schema.Json): Uint8Array => {
  const payload = new TextEncoder().encode(Schema.encodeSync(Schema.fromJsonString(Schema.Json))(request))
  const frame = new Uint8Array(5 + payload.length)
  new DataView(frame.buffer).setUint32(1, payload.length)
  frame.set(payload, 5)
  return frame
}

/** @experimental E2B hosted microVM configuration. */
export interface Options {
  readonly apiKey: Config.Config<Redacted.Redacted<string>>
  readonly template: string
  readonly autoPauseAfter?: Duration.Input
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
    module: "E2BFileSystem",
    method,
    pathOrDescriptor: path,
    description: message(cause, `E2B ${method} failed`),
    cause,
  })

const decodeError = (response: HttpClientResponse.HttpClientResponse): Effect.Effect<string> =>
  response.text.pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.fromJsonString(ApiError))),
    Effect.map((error) => error.message),
    Effect.orElseSucceed(() => `E2B request failed with HTTP ${response.status}`),
  )

const decodeJson = <S extends Schema.Constraint>(
  response: HttpClientResponse.HttpClientResponse,
  schema: S,
  fallback: string,
) =>
  response.status >= 200 && response.status < 300
    ? response.json.pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(schema)),
        Effect.mapError((cause) => unavailable(cause, fallback)),
      )
    : decodeError(response).pipe(Effect.flatMap((failure) => Effect.fail(Unavailable.make({ message: failure }))))

const requestedLimits = (requested: Limits | undefined): Effect.Effect<Limits, Unsupported> => {
  if (requested?.cpuMs !== undefined)
    return Effect.fail(unsupported("limit:cpu", "E2B templates fix CPU capacity at image build time"))
  if (requested?.memoryMb !== undefined)
    return Effect.fail(unsupported("limit:memory", "E2B templates fix memory capacity at image build time"))
  return Effect.succeed(requested?.wallClock === undefined ? {} : { wallClock: requested.wallClock })
}

const exitCode = (event: Extract<typeof ProcessEvent.Type, { readonly end: unknown }>): number => {
  if (event.end.exitCode !== undefined && event.end.exitCode !== 0) return event.end.exitCode
  const prefix = "exit status "
  if (!event.end.status.startsWith(prefix)) return event.end.exitCode ?? 0
  const parsed = Number(event.end.status.slice(prefix.length))
  return Number.isInteger(parsed) ? parsed : (event.end.exitCode ?? 0)
}

const decodeFrames = (buffer: ArrayBuffer) =>
  Effect.gen(function* () {
    const bytes = new Uint8Array(buffer)
    const responses: Array<typeof StartResponse.Type> = []
    for (let offset = 0; offset < bytes.length; ) {
      if (offset + 5 > bytes.length) return yield* executionFailed(bytes, "E2B returned a truncated Connect frame")
      const flags = bytes[offset]!
      const length = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0)
      offset += 5
      if (offset + length > bytes.length)
        return yield* executionFailed(bytes, "E2B returned a truncated Connect payload")
      const encoded = new TextDecoder().decode(bytes.subarray(offset, offset + length))
      offset += length
      if ((flags & 2) !== 0) {
        const end = yield* Schema.decodeEffect(Schema.fromJsonString(ConnectEnd))(encoded).pipe(
          Effect.mapError((cause) => executionFailed(cause, "E2B returned an invalid Connect end frame")),
        )
        if (end.error !== undefined)
          return yield* ExecutionFailed.make({ message: end.error.message, cause: end.error })
        continue
      }
      responses.push(
        yield* Schema.decodeEffect(Schema.fromJsonString(StartResponse))(encoded).pipe(
          Effect.mapError((cause) => executionFailed(cause, "E2B returned an invalid process event")),
        ),
      )
    }
    return responses
  })

const outputText = (encoded: string): Effect.Effect<string, ExecutionFailed> =>
  Result.match(Encoding.decodeBase64String(encoded), {
    onFailure: (cause) => Effect.fail(executionFailed(cause, "E2B returned invalid base64 process output")),
    onSuccess: Effect.succeed,
  })

/** @experimental Construct the E2B provider over Effect HttpClient. */
export const makeProvider = (
  options: Omit<Options, "apiKey"> & { readonly apiKey: Redacted.Redacted<string> },
): Effect.Effect<SandboxProviderService, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const aliases = yield* Ref.make<ReadonlyMap<string, string>>(new Map())
    const apiRequest = (request: HttpClientRequest.HttpClientRequest) =>
      request.pipe(
        HttpClientRequest.setHeader("x-api-key", Redacted.value(options.apiKey)),
        http.execute,
        Effect.mapError((cause) => unavailable(cause, "E2B is unavailable")),
        Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "x-api-key", "x-access-token"]),
      )

    const envdRequest = (connection: Connection) => (request: HttpClientRequest.HttpClientRequest) => {
      let prepared = request.pipe(
        HttpClientRequest.setHeader("e2b-sandbox-id", connection.sandboxID),
        HttpClientRequest.setHeader("e2b-sandbox-port", envdPort),
      )
      if (connection.envdAccessToken !== undefined && connection.envdAccessToken !== null)
        prepared = prepared.pipe(HttpClientRequest.setHeader("x-access-token", connection.envdAccessToken))
      return prepared.pipe(
        http.execute,
        Effect.mapError((cause) => unavailable(cause, `E2B sandbox ${connection.sandboxID} is unavailable`)),
        Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "x-api-key", "x-access-token"]),
      )
    }

    const create = (
      templateID: string,
      snapshotId?: string,
    ): Effect.Effect<Connection, Unavailable | SnapshotNotFound> =>
      Effect.gen(function* () {
        const response = yield* HttpClientRequest.post(`${apiUrl}/sandboxes`).pipe(
          HttpClientRequest.bodyJsonUnsafe({
            templateID,
            timeout: sandboxTimeoutSeconds,
            secure: true,
            allow_internet_access: true,
          }),
          apiRequest,
        )
        if (response.status === 404 && snapshotId !== undefined) return yield* SnapshotNotFound.make({ snapshotId })
        return yield* decodeJson(response, SandboxResponse, "E2B returned an invalid sandbox response")
      })

    const connect = (sandboxID: string) =>
      HttpClientRequest.post(`${apiUrl}/sandboxes/${encodeURIComponent(sandboxID)}/connect`).pipe(
        HttpClientRequest.bodyJsonUnsafe({ timeout: sandboxTimeoutSeconds }),
        apiRequest,
        Effect.flatMap((response) => decodeJson(response, SandboxResponse, "E2B returned an invalid connect response")),
      )

    const sandbox = (initial: Connection, limits: Limits, scope: Scope.Scope): Effect.Effect<SandboxService, never> =>
      Effect.gen(function* () {
        const connection = yield* Ref.make(initial)
        const lifecycle = (path: string, accepted: ReadonlyArray<number>) =>
          Ref.get(connection).pipe(
            Effect.flatMap((current) =>
              HttpClientRequest.post(`${apiUrl}/sandboxes/${encodeURIComponent(current.sandboxID)}${path}`).pipe(
                HttpClientRequest.bodyJsonUnsafe({ memory: true }),
                apiRequest,
              ),
            ),
            Effect.flatMap((response) =>
              accepted.includes(response.status)
                ? Effect.void
                : decodeError(response).pipe(
                    Effect.flatMap((failure) => Effect.fail(Unavailable.make({ message: failure }))),
                  ),
            ),
          )
        const pause = lifecycle("/pause", [204, 409])
        yield* Scope.addFinalizer(scope, pause.pipe(Effect.ignore))

        const files = FileSystem.makeNoop({
          makeDirectory: (path) =>
            Ref.get(connection).pipe(
              Effect.flatMap((current) =>
                HttpClientRequest.post(`${sandboxUrl}/filesystem.Filesystem/MakeDir`).pipe(
                  HttpClientRequest.setHeader("connect-protocol-version", "1"),
                  HttpClientRequest.bodyUint8Array(connectBody({ path }), "application/connect+json"),
                  envdRequest(current),
                ),
              ),
              Effect.mapError((cause) => platformFailure("makeDirectory", path, cause)),
              Effect.flatMap((response) =>
                response.status >= 200 && response.status < 300
                  ? Effect.void
                  : decodeError(response).pipe(
                      Effect.flatMap((failure) => Effect.fail(platformFailure("makeDirectory", path, failure))),
                    ),
              ),
            ),
          readFileString: (path) =>
            Ref.get(connection).pipe(
              Effect.flatMap((current) =>
                HttpClientRequest.get(`${sandboxUrl}/files`).pipe(
                  HttpClientRequest.setUrlParams({ path }),
                  envdRequest(current),
                ),
              ),
              Effect.mapError((cause) => platformFailure("readFileString", path, cause)),
              Effect.flatMap((response) =>
                response.status >= 200 && response.status < 300
                  ? response.text.pipe(Effect.mapError((cause) => platformFailure("readFileString", path, cause)))
                  : decodeError(response).pipe(
                      Effect.flatMap((failure) => Effect.fail(platformFailure("readFileString", path, failure))),
                    ),
              ),
            ),
          writeFileString: (path, data) =>
            Ref.get(connection).pipe(
              Effect.flatMap((current) =>
                HttpClientRequest.post(`${sandboxUrl}/files`).pipe(
                  HttpClientRequest.setUrlParams({ path }),
                  HttpClientRequest.bodyText(data, "text/plain; charset=utf-8"),
                  HttpClientRequest.setHeader("content-type", "application/octet-stream"),
                  envdRequest(current),
                ),
              ),
              Effect.mapError((cause) => platformFailure("writeFileString", path, cause)),
              Effect.flatMap((response) =>
                response.status >= 200 && response.status < 300
                  ? Effect.void
                  : decodeError(response).pipe(
                      Effect.flatMap((failure) => Effect.fail(platformFailure("writeFileString", path, failure))),
                    ),
              ),
            ),
        })

        const start: SandboxService["start"] = (command) => {
          if (command._tag !== "Process") {
            const operation = command._tag === "TypeScript" ? "exec:typescript" : "exec:javascript-module"
            return Effect.fail(unsupported(operation, `E2B does not execute ${command._tag} commands`))
          }
          const deadline = wallClockMillis(limits)
          const process: ProcessRequest =
            command.stdin === undefined
              ? { cmd: command.command, args: command.arguments }
              : {
                  cmd: "/bin/sh",
                  args: ["-c", 'printf %s "$GENERALIST_STDIN" | exec "$@"', "_", command.command, ...command.arguments],
                  envs: { ...command.environment, GENERALIST_STDIN: command.stdin },
                }
          if (command.cwd !== undefined) process.cwd = command.cwd
          if (command.environment !== undefined && command.stdin === undefined) process.envs = command.environment
          const execute = Ref.get(connection).pipe(
            Effect.flatMap((current) =>
              HttpClientRequest.post(`${sandboxUrl}/process.Process/Start`).pipe(
                HttpClientRequest.bodyUint8Array(
                  connectBody(Schema.encodeSync(StartRequest)({ process, stdin: false })),
                  "application/connect+json",
                ),
                HttpClientRequest.setHeader("connect-protocol-version", "1"),
                envdRequest(current),
              ),
            ),
            Effect.flatMap((response) =>
              Effect.gen(function* () {
                if (response.status < 200 || response.status >= 300) {
                  const failure = yield* decodeError(response)
                  if ([401, 404, 429, 502, 503, 504].includes(response.status))
                    return yield* Unavailable.make({ message: failure })
                  return yield* ExecutionFailed.make({ message: failure })
                }
                return yield* response.arrayBuffer.pipe(
                  Effect.mapError((cause) => executionFailed(cause, "E2B process response failed")),
                )
              }),
            ),
            Effect.flatMap(decodeFrames),
            Effect.mapError(
              (cause): SandboxError =>
                Schema.is(ExecutionFailed)(cause) || Schema.is(Unavailable)(cause)
                  ? cause
                  : executionFailed(cause, "E2B command failed"),
            ),
          )
          const bounded =
            deadline === undefined
              ? execute
              : execute.pipe(
                  Effect.timeoutOrElse({
                    duration: Duration.millis(deadline),
                    orElse: () => Effect.fail(LimitExceeded.make({ resource: "wall-clock", limit: deadline })),
                  }),
                )
          return bounded.pipe(
            Effect.flatMap((responses) =>
              Effect.gen(function* () {
                const events: Array<{
                  readonly _tag: "Output"
                  readonly channel: "stdout" | "stderr"
                  readonly text: string
                }> = []
                let stdout = ""
                let stderr = ""
                let code: number | undefined
                for (const response of responses) {
                  const event = response.event
                  if ("data" in event && "stdout" in event.data) {
                    const text = yield* outputText(event.data.stdout)
                    stdout += text
                    events.push({ _tag: "Output", channel: "stdout", text })
                  } else if ("data" in event && "stderr" in event.data) {
                    const text = yield* outputText(event.data.stderr)
                    stderr += text
                    events.push({ _tag: "Output", channel: "stderr", text })
                  } else if ("end" in event) {
                    if (event.end.error !== undefined && event.end.error !== null)
                      return yield* ExecutionFailed.make({ message: event.end.error, cause: event.end })
                    code = exitCode(event)
                  }
                }
                if (code === undefined)
                  return yield* ExecutionFailed.make({ message: "E2B process stream ended without an exit event" })
                return {
                  events: Stream.fromIterable(events),
                  result: Effect.succeed({ stdout, stderr, exitCode: code }),
                }
              }),
            ),
          )
        }

        return make({
          isolation: "microvm",
          limits,
          capabilities: {
            commands: ["Process"],
            files: true,
            pause: true,
            resume: true,
            snapshot: true,
            fork: true,
            limits: ["wall-clock"],
          },
          start,
          files: Effect.succeed(files),
          pause,
          resume: Ref.get(connection).pipe(
            Effect.flatMap((current) => connect(current.sandboxID)),
            Effect.flatMap((resumed) => Ref.set(connection, resumed)),
          ),
          snapshot: Ref.get(connection).pipe(
            Effect.flatMap((current) =>
              HttpClientRequest.post(`${apiUrl}/sandboxes/${encodeURIComponent(current.sandboxID)}/snapshots`).pipe(
                HttpClientRequest.bodyJsonUnsafe({}),
                apiRequest,
              ),
            ),
            Effect.flatMap((response) => decodeJson(response, SnapshotResponse, "E2B returned an invalid snapshot")),
            Effect.map((snapshot) => snapshot.snapshotID),
          ),
          fork: (snapshotId, request = {}) =>
            create(snapshotId, snapshotId).pipe(
              Effect.tap((forked) => {
                const key = request.key
                return key === undefined
                  ? Effect.void
                  : Ref.update(aliases, (current) => new Map(current).set(key, forked.sandboxID))
              }),
              Effect.flatMap((forked) => sandbox(forked, limits, scope)),
            ),
        })
      })

    const provider = SandboxProvider.of({
      defaultImage: options.template,
      acquire: (request: AcquireOptions = {}) =>
        Effect.gen(function* () {
          const limits = yield* requestedLimits(request.limits)
          const scope = yield* Scope.Scope
          const key = request.key
          const connection =
            key === undefined
              ? yield* create(request.image ?? options.template)
              : yield* connect((yield* Ref.get(aliases)).get(key) ?? key)
          return yield* sandbox(connection, limits, scope)
        }),
    })
    return options.autoPauseAfter === undefined ? provider : autoPause(provider, options.autoPauseAfter)
  })

/** @experimental Provide the hosted E2B microVM Sandbox leaf. */
export const layer = (options: Options): Layer.Layer<SandboxProvider, Config.ConfigError, HttpClient.HttpClient> =>
  Layer.effect(SandboxProvider, options.apiKey.pipe(Effect.flatMap((apiKey) => makeProvider({ ...options, apiKey }))))
