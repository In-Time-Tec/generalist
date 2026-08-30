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
  Scope,
  Schema,
  Stream,
} from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { make as makeCursor, type Cursor } from "../runtime/cursor.js"
import { ReconnectExhausted, TransportError } from "./errors.js"
import { encodeCommand, ObserverRunEvent, observerCodec, type ClientCommand, type ResolvedRunEvent } from "./wire.js"

/** @experimental */
export type ConnectionStatus =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Connected" }
  | { readonly _tag: "Disconnected"; readonly error: TransportError }
  | { readonly _tag: "Retrying"; readonly attempt: number }

/** @experimental */
export interface ReconnectPolicy {
  readonly schedule: Schedule.Schedule<unknown, TransportError>
  readonly retryable: (error: TransportError) => boolean
}

/** @experimental */
export interface ConnectOptions {
  readonly url: string
  readonly runId: string
  readonly cursor?: Cursor
  readonly eventCapacity?: number
  readonly reconnect?: ReconnectPolicy
}

/** @experimental */
export interface Connection {
  readonly events: Stream.Stream<ResolvedRunEvent, TransportError>
  readonly cancel: (reason?: string) => Effect.Effect<void, TransportError>
  readonly status: Stream.Stream<ConnectionStatus>
  readonly exhausted: Effect.Effect<never, ReconnectExhausted>
}

/** @experimental */
export interface Service {
  readonly connect: (options: ConnectOptions) => Effect.Effect<Connection, never, Scope.Scope>
}

/** @experimental */
export class RunClient extends Context.Service<RunClient, Service>()("tenetkit/transport/run-client/RunClient") {}

const transportError = (message: string, kind?: TransportError["kind"]): TransportError =>
  TransportError.make(kind === undefined ? { message } : { message, kind })

const socketError = (error: Socket.SocketError): TransportError => transportError(error.message, "socket")

const urlWithCursor = (url: string, cursor: Cursor | undefined): string => {
  if (cursor === undefined) return url
  const parsed = new URL(url, "http://tenetkit.local")
  parsed.searchParams.set("cursor", String(cursor))
  return /^[a-z][a-z0-9+.-]*:/i.test(url) ? parsed.toString() : `${parsed.pathname}${parsed.search}${parsed.hash}`
}

/** @experimental Follows canonical RunEvents over SSE from an exclusive cursor. */
export const streamSSE = (options: {
  readonly url: string
  readonly cursor?: Cursor
}): Stream.Stream<ResolvedRunEvent, TransportError, HttpClient.HttpClient> =>
  HttpClientResponse.stream(HttpClient.get(urlWithCursor(options.url, options.cursor))).pipe(
    Stream.decodeText,
    Stream.pipeThroughChannel(Sse.decodeDataSchema(ObserverRunEvent)),
    Stream.mapEffect((event) => {
      if (event.id === undefined || event.id !== String(event.data.sequence)) {
        return Effect.fail(transportError("SSE event ID does not match RunEvent sequence", "protocol"))
      }
      return Effect.succeed(event.data)
    }),
    Stream.mapError((error) =>
      Schema.is(TransportError)(error)
        ? error
        : transportError(error instanceof Error ? error.message : JSON.stringify(error), "protocol"),
    ),
  )

const defaultReconnectPolicy: ReconnectPolicy = {
  schedule: Schedule.exponential("100 millis").pipe(Schedule.upTo({ times: 5 })),
  retryable: (error) => error.kind === "socket",
}

const writeSocket = (
  writer: (chunk: string | Uint8Array | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>,
  chunk: string,
): Effect.Effect<void, TransportError> =>
  writer(chunk).pipe(
    Effect.mapError(socketError),
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.failCause(cause)
        : Effect.fail(transportError(String(Cause.squash(cause)), "socket")),
    ),
  )

/** @experimental Reconnecting WebSocket client with a bounded event queue. */
export const layerWebSocket: Layer.Layer<RunClient, never, Socket.WebSocketConstructor> = Layer.effect(
  RunClient,
  Effect.gen(function* () {
    const constructor = yield* Socket.WebSocketConstructor
    return RunClient.of({
      connect: (options) =>
        Effect.gen(function* () {
          const capacity = options.eventCapacity ?? 256
          if (!Number.isSafeInteger(capacity) || capacity <= 0) {
            return yield* Effect.die(new TypeError("eventCapacity must be a positive safe integer"))
          }
          const reconnect = options.reconnect ?? defaultReconnectPolicy
          const scope = yield* Effect.scope
          const eventQueue = yield* Queue.bounded<ResolvedRunEvent, TransportError>(capacity)
          const statusQueue = yield* Queue.sliding<ConnectionStatus>(8)
          const writerRef = yield* Ref.make<Option.Option<(chunk: string) => Effect.Effect<void, TransportError>>>(
            Option.none(),
          )
          const cursorRef = yield* Ref.make<Option.Option<Cursor>>(
            options.cursor === undefined ? Option.none() : Option.some(options.cursor),
          )
          const attemptRef = yield* Ref.make(0)
          const exhausted = yield* Deferred.make<never, ReconnectExhausted>()

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
                  const done = yield* Deferred.make<void, TransportError>()
                  const ingress = yield* Queue.dropping<string>(capacity)
                  const overflow = yield* Deferred.make<never, TransportError>()
                  const handleRaw = (data: string | Uint8Array): void => {
                    if (data instanceof Uint8Array) {
                      Deferred.doneUnsafe(overflow, Effect.fail(transportError("binary RunEvent", "protocol")))
                    } else if (!Queue.offerUnsafe(ingress, data)) {
                      Deferred.doneUnsafe(
                        overflow,
                        Effect.fail(transportError("event buffer capacity exceeded", "socket")),
                      )
                    }
                  }
                  yield* Stream.fromQueue(ingress).pipe(
                    Stream.runForEach((text) =>
                      observerCodec.decode(text).pipe(
                        Effect.mapError((error) => transportError(error.message, "protocol")),
                        Effect.flatMap((event) =>
                          Queue.offer(eventQueue, event).pipe(
                            Effect.andThen(Ref.set(cursorRef, Option.some(makeCursor(event.sequence)))),
                          ),
                        ),
                      ),
                    ),
                    Effect.tapError((error) => Deferred.fail(overflow, error)),
                    Effect.forkChild,
                  )
                  yield* socket.runRaw(handleRaw, { onOpen: Deferred.succeed(opened, undefined) }).pipe(
                    Effect.mapError(socketError),
                    Effect.raceFirst(Deferred.await(overflow)),
                    Effect.onExit((exit) => Deferred.done(done, exit)),
                    Effect.forkChild,
                  )
                  yield* Deferred.await(opened).pipe(Effect.raceFirst(Deferred.await(done)))
                  const write = (text: string) => writeSocket(writer, text).pipe(Effect.raceFirst(Deferred.await(done)))
                  const cursor = Option.getOrUndefined(yield* Ref.get(cursorRef))
                  const attachCommand: ClientCommand =
                    cursor === undefined
                      ? { _tag: "Attach", runId: options.runId }
                      : { _tag: "Attach", runId: options.runId, cursor }
                  yield* encodeCommand(attachCommand).pipe(
                    Effect.mapError((error) => transportError(error.message, "encoding")),
                    Effect.flatMap(write),
                  )
                  yield* Ref.set(writerRef, Option.some(write))
                  yield* Queue.offer(statusQueue, { _tag: "Connected" })
                  yield* Deferred.await(done)
                }),
              ).pipe(
                Effect.ensuring(Ref.set(writerRef, Option.none())),
                Effect.tapError((error) => Queue.offer(statusQueue, { _tag: "Disconnected", error })),
              )
            }),
          )

          const runClient = runSocket.pipe(
            Effect.retry({ schedule: reconnect.schedule, while: reconnect.retryable }),
            Effect.catch((error) => {
              const failure = ReconnectExhausted.make({ lastError: error })
              return Deferred.fail(exhausted, failure).pipe(
                Effect.andThen(Queue.fail(eventQueue, error)),
                Effect.asVoid,
              )
            }),
          )
          const fiber = yield* runClient.pipe(Effect.forkIn(scope))
          yield* Effect.addFinalizer(() =>
            Fiber.interrupt(fiber).pipe(
              Effect.andThen(Queue.shutdown(eventQueue)),
              Effect.andThen(Queue.shutdown(statusQueue)),
              Effect.asVoid,
            ),
          )

          const send = (command: ClientCommand) =>
            Effect.gen(function* () {
              const writer = yield* Ref.get(writerRef)
              if (Option.isNone(writer)) return yield* transportError("WebSocket is not open", "not-open")
              const text = yield* encodeCommand(command).pipe(
                Effect.mapError((error) => transportError(error.message, "encoding")),
              )
              yield* writer.value(text)
            })

          return {
            events: Stream.fromQueue(eventQueue),
            cancel: (reason) => {
              const command: ClientCommand =
                reason === undefined
                  ? { _tag: "Cancel", runId: options.runId }
                  : { _tag: "Cancel", runId: options.runId, reason }
              return send(command)
            },
            status: Stream.fromQueue(statusQueue),
            exhausted: Deferred.await(exhausted),
          }
        }),
    })
  }),
)
