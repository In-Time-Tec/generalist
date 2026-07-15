import {
  Cause,
  Context,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Queue,
  Ref,
  Schedule,
  Schema,
  Scope,
  Stream,
} from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Toolkit } from "effect/unstable/ai"
import { ReconnectExhausted, TransportError } from "./errors.js"
import { codec, LooseServerFrame, Sequence, SequenceFromString } from "./wire.js"
import type { ClientFrameType, LooseServerFrameType } from "./wire.js"
/** @experimental */
export type ConnectionStatus =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Connected" }
  | { readonly _tag: "Disconnected"; readonly error: TransportError }
  | { readonly _tag: "Retrying"; readonly attempt: number }

/** @experimental */
export interface BufferPolicy {
  readonly frameCapacity: number
  readonly frameStrategy: "backpressure" | "dropping" | "sliding"
  readonly statusCapacity: number
  readonly statusStrategy: "dropping" | "sliding"
}

/** @experimental */
export interface ReconnectPolicy {
  readonly schedule: Schedule.Schedule<unknown, TransportError>
  readonly retryable: (error: TransportError) => boolean
}

/** @experimental */
export interface ConnectOptions {
  readonly url: string
  readonly sessionId: string
  readonly buffering?: BufferPolicy
  readonly reconnect?: ReconnectPolicy
}

/** @experimental */
export interface Connection {
  readonly frames: Stream.Stream<LooseServerFrameType, TransportError>
  readonly send: (frame: ClientFrameType) => Effect.Effect<void, TransportError>
  readonly status: Stream.Stream<ConnectionStatus>
  readonly exhausted: Effect.Effect<never, ReconnectExhausted>
}

/** @experimental */
export interface AgentClientInterface {
  readonly connect: (options: ConnectOptions) => Effect.Effect<Connection, never, Scope.Scope>
}

/** @experimental */
export class AgentClient extends Context.Service<AgentClient, AgentClientInterface>()(
  "@batonfx/transport/client/AgentClient",
) {}

const ServerFrameJson = Schema.fromJsonString(LooseServerFrame)
const wireCodec = codec(Toolkit.empty)

const transportError = (message: string, kind?: TransportError["kind"]): TransportError =>
  TransportError.make(kind === undefined ? { message } : { message, kind })

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const decodeServerText = (text: string): Effect.Effect<LooseServerFrameType, TransportError> =>
  Schema.decodeUnknownEffect(ServerFrameJson)(text).pipe(
    Effect.mapError((error) => transportError(errorMessage(error), "protocol")),
  )

const encodeClientText = (frame: ClientFrameType): Effect.Effect<string, TransportError> =>
  wireCodec.encodeClient(frame).pipe(Effect.mapError((error) => transportError(error.message, "encoding")))

const urlWithAfterSeq = (url: string, afterSeq: number | undefined): string => {
  if (afterSeq === undefined) return url
  try {
    const parsed = new URL(url, "http://batonfx.local")
    parsed.searchParams.set("after_seq", String(afterSeq))
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return parsed.toString()
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    const separator = url.includes("?") ? "&" : "?"
    return `${url}${separator}after_seq=${afterSeq}`
  }
}

/** @experimental */
export const sseFrames = (options: {
  readonly url: string
  readonly afterSeq?: number
}): Stream.Stream<LooseServerFrameType, TransportError, HttpClient.HttpClient> =>
  Stream.unwrap(
    (options.afterSeq === undefined
      ? Effect.succeed(options.url)
      : Schema.decodeUnknownEffect(Sequence)(options.afterSeq).pipe(
          Effect.map((afterSeq) => urlWithAfterSeq(options.url, afterSeq)),
        )
    ).pipe(
      Effect.map((url) =>
        HttpClientResponse.stream(HttpClient.get(url)).pipe(
          Stream.decodeText,
          Stream.pipeThroughChannel(Sse.decodeDataSchema(LooseServerFrame)),
          Stream.mapEffect((event) => {
            if (event.id === undefined) return Effect.succeed(event.data)
            if (event.data._tag === "Snapshot" && event.data.seq === -1) {
              return event.id === "-1"
                ? Effect.succeed(event.data)
                : Effect.fail(transportError("SSE event ID does not match payload sequence", "protocol"))
            }
            return Schema.decodeUnknownEffect(SequenceFromString)(event.id).pipe(
              Effect.flatMap((id) =>
                id === event.data.seq
                  ? Effect.succeed(event.data)
                  : Effect.fail(transportError("SSE event ID does not match payload sequence", "protocol")),
              ),
            )
          }),
        ),
      ),
      Effect.mapError((error) => error.pipe(errorMessage, (message) => transportError(message, "protocol"))),
    ),
  ).pipe(
    Stream.mapError((error) =>
      Schema.is(TransportError)(error) ? error : transportError(errorMessage(error), "protocol"),
    ),
  )

const attachFrame = (sessionId: string, afterSeq: Option.Option<number>): ClientFrameType =>
  Option.match(afterSeq, {
    onNone: () => ({ _tag: "Attach", sessionId }),
    onSome: (seq) => ({ _tag: "Attach", sessionId, afterSeq: seq }),
  })

const defaultBufferPolicy: BufferPolicy = {
  frameCapacity: 256,
  frameStrategy: "backpressure",
  statusCapacity: 8,
  statusStrategy: "sliding",
}

const defaultReconnectPolicy: ReconnectPolicy = {
  schedule: Schedule.exponential("100 millis").pipe(Schedule.both(Schedule.recurs(5))),
  retryable: (error) => error.kind === "socket",
}

const validateCapacity = (name: string, value: number): Effect.Effect<void> =>
  Number.isSafeInteger(value) && value > 0 ? Effect.void : Effect.die(`${name} must be a positive safe integer`)

const validateBufferPolicy = (policy: BufferPolicy): Effect.Effect<void> =>
  validateCapacity("frameCapacity", policy.frameCapacity).pipe(
    Effect.andThen(validateCapacity("statusCapacity", policy.statusCapacity)),
    Effect.andThen(
      policy.frameStrategy === "backpressure" ||
        policy.frameStrategy === "dropping" ||
        policy.frameStrategy === "sliding"
        ? Effect.void
        : Effect.die("frameStrategy must be backpressure, dropping, or sliding"),
    ),
    Effect.andThen(
      policy.statusStrategy === "dropping" || policy.statusStrategy === "sliding"
        ? Effect.void
        : Effect.die("statusStrategy must be dropping or sliding"),
    ),
  )

const makeFrameQueue = (policy: BufferPolicy): Effect.Effect<Queue.Queue<LooseServerFrameType, TransportError>> => {
  switch (policy.frameStrategy) {
    case "backpressure":
      return Queue.bounded(policy.frameCapacity)
    case "dropping":
      return Queue.dropping(policy.frameCapacity)
    case "sliding":
      return Queue.sliding(policy.frameCapacity)
  }
}

const makeStatusQueue = (policy: BufferPolicy): Effect.Effect<Queue.Queue<ConnectionStatus>> =>
  policy.statusStrategy === "dropping" ? Queue.dropping(policy.statusCapacity) : Queue.sliding(policy.statusCapacity)

const makeIngressQueue = (policy: BufferPolicy): Effect.Effect<Queue.Queue<string>> => {
  switch (policy.frameStrategy) {
    case "backpressure":
    case "dropping":
      return Queue.dropping(policy.frameCapacity)
    case "sliding":
      return Queue.sliding(policy.frameCapacity)
  }
}

const socketError = (error: unknown): TransportError => transportError(errorMessage(error), "socket")

const writeSocket = (
  writer: (chunk: string | Uint8Array | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>,
  chunk: string,
): Effect.Effect<void, TransportError> =>
  writer(chunk).pipe(
    Effect.mapError(socketError),
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause) ? Effect.failCause(cause) : Effect.fail(socketError(Cause.squash(cause))),
    ),
  )

/** @experimental */
export const layerWebSocket: Layer.Layer<AgentClient, never, Socket.WebSocketConstructor> = Layer.effect(
  AgentClient,
  Effect.gen(function* () {
    const constructor = yield* Socket.WebSocketConstructor

    return AgentClient.of({
      connect: (options) =>
        Effect.gen(function* () {
          const buffering = options.buffering ?? defaultBufferPolicy
          const reconnect = options.reconnect ?? defaultReconnectPolicy
          yield* validateBufferPolicy(buffering)
          const scope = yield* Effect.scope
          const framesQueue = yield* makeFrameQueue(buffering)
          const statusQueue = yield* makeStatusQueue(buffering)
          const writerRef = yield* Ref.make<Option.Option<(chunk: string) => Effect.Effect<void, TransportError>>>(
            Option.none(),
          )
          const lastSeq = yield* Ref.make<Option.Option<number>>(Option.none())
          const attemptRef = yield* Ref.make(0)
          const exhausted = yield* Deferred.make<never, ReconnectExhausted>()
          const lastClassification = yield* Ref.make<
            Option.Option<{ readonly error: TransportError; readonly retryable: boolean }>
          >(Option.none())

          const writeClient = (frame: ClientFrameType): Effect.Effect<void, TransportError> =>
            Effect.gen(function* () {
              const writer = yield* Ref.get(writerRef)
              if (Option.isNone(writer)) return yield* transportError("WebSocket is not open", "not-open")
              const text = yield* encodeClientText(frame)
              yield* writer.value(text)
            })

          const runSocket = Effect.suspend(() =>
            Effect.gen(function* () {
              const attempt = yield* Ref.getAndUpdate(attemptRef, (current) => current + 1)
              yield* Queue.offer(statusQueue, attempt === 0 ? { _tag: "Connecting" } : { _tag: "Retrying", attempt })
              yield* Effect.scoped(
                Effect.gen(function* () {
                  const socket = yield* Socket.makeWebSocket(options.url).pipe(
                    Effect.provideService(Socket.WebSocketConstructor, (url, protocols) => {
                      const webSocket = constructor(url, protocols)
                      webSocket.binaryType = "arraybuffer"
                      return webSocket
                    }),
                  )
                  const writer = yield* socket.writer
                  const opened = yield* Deferred.make<void>()
                  const runDone = yield* Deferred.make<void, TransportError>()
                  const attemptFailure = yield* Deferred.make<never, TransportError>()
                  const ingressQueue = yield* makeIngressQueue(buffering)
                  const failAttempt = (error: TransportError): void => {
                    Deferred.doneUnsafe(attemptFailure, Effect.fail(error))
                  }
                  const handleRaw = (data: string | Uint8Array): void => {
                    if (typeof data !== "string") return failAttempt(transportError("binary server frame", "protocol"))
                    const accepted = Queue.offerUnsafe(ingressQueue, data)
                    if (!accepted && buffering.frameStrategy === "backpressure") {
                      failAttempt(transportError("frame buffer capacity exceeded", "socket"))
                    }
                  }
                  yield* Stream.fromQueue(ingressQueue).pipe(
                    Stream.runForEach((text) =>
                      decodeServerText(text).pipe(
                        Effect.flatMap((frame) =>
                          Queue.offer(framesQueue, frame).pipe(
                            Effect.flatMap((accepted) =>
                              accepted
                                ? Ref.set(
                                    lastSeq,
                                    frame._tag === "Snapshot" && frame.seq === -1
                                      ? Option.none()
                                      : Option.some(frame.seq),
                                  )
                                : Effect.void,
                            ),
                          ),
                        ),
                      ),
                    ),
                    Effect.tapError((error) => Deferred.fail(attemptFailure, error)),
                    Effect.forkChild,
                  )
                  yield* socket.runRaw(handleRaw, { onOpen: Deferred.succeed(opened, undefined) }).pipe(
                    Effect.mapError((error) => (Schema.is(TransportError)(error) ? error : socketError(error))),
                    Effect.raceFirst(Deferred.await(attemptFailure)),
                    Effect.onExit((exit) => Deferred.done(runDone, exit)),
                    Effect.forkChild,
                  )
                  yield* Deferred.await(opened).pipe(Effect.raceFirst(Deferred.await(runDone)))
                  const writeWhileOpen = (text: string): Effect.Effect<void, TransportError> =>
                    writeSocket(writer, text).pipe(Effect.raceFirst(Deferred.await(runDone)))
                  const attach = attachFrame(options.sessionId, yield* Ref.get(lastSeq))
                  const encoded = yield* encodeClientText(attach)
                  yield* writeWhileOpen(encoded)
                  yield* Ref.set(writerRef, Option.some(writeWhileOpen))
                  yield* Queue.offer(statusQueue, { _tag: "Connected" })
                  yield* Deferred.await(runDone)
                }),
              ).pipe(
                Effect.ensuring(Ref.set(writerRef, Option.none())),
                Effect.tapError((error) => Queue.offer(statusQueue, { _tag: "Disconnected", error })),
              )
            }),
          )

          const runClient = runSocket.pipe(
            Effect.retry({
              schedule: reconnect.schedule,
              while: (error) => {
                const retryable = reconnect.retryable(error)
                return Ref.set(lastClassification, Option.some({ error, retryable })).pipe(Effect.as(retryable))
              },
            }),
            Effect.matchEffect({
              onFailure: (error) =>
                Ref.get(lastClassification).pipe(
                  Effect.flatMap((classification) => {
                    const retryable =
                      Option.isSome(classification) && classification.value.error === error
                        ? classification.value.retryable
                        : reconnect.retryable(error)
                    if (!retryable) return Queue.fail(framesQueue, error).pipe(Effect.asVoid)
                    const failure = ReconnectExhausted.make({ lastError: error })
                    return Deferred.fail(exhausted, failure).pipe(
                      Effect.andThen(Queue.fail(framesQueue, error)),
                      Effect.asVoid,
                    )
                  }),
                ),
              onSuccess: () => Effect.void,
            }),
          )

          const clientFiber = yield* runClient.pipe(Effect.forkIn(scope))
          yield* Effect.addFinalizer(() =>
            Fiber.interrupt(clientFiber).pipe(
              Effect.andThen(Ref.set(writerRef, Option.none())),
              Effect.andThen(Queue.shutdown(framesQueue)),
              Effect.andThen(Queue.shutdown(statusQueue)),
              Effect.asVoid,
            ),
          )

          return {
            frames: Stream.fromQueue(framesQueue),
            send: writeClient,
            status: Stream.fromQueue(statusQueue),
            exhausted: Deferred.await(exhausted),
          }
        }),
    })
  }),
)
