import { Cause, Context, Effect, Layer, Option, Queue, Ref, Schema, Scope, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { TransportError } from "./errors.js"
import { ClientFrame, LooseServerFrame } from "./wire.js"
import type { ClientFrameType, LooseServerFrameType } from "./wire.js"
/** @experimental */
export type ConnectionStatus =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Open" }
  | { readonly _tag: "Reconnecting" }
  | { readonly _tag: "Closed" }

/** @experimental */
export interface Connection {
  readonly frames: Stream.Stream<LooseServerFrameType, TransportError>
  readonly send: (frame: ClientFrameType) => Effect.Effect<void, TransportError>
  readonly status: Stream.Stream<ConnectionStatus>
}

/** @experimental */
export interface AgentClientInterface {
  readonly connect: (options: {
    readonly url: string
    readonly sessionId: string
  }) => Effect.Effect<Connection, never, Scope.Scope>
}

/** @experimental */
export class AgentClient extends Context.Service<AgentClient, AgentClientInterface>()(
  "@batonfx/transport/client/AgentClient",
) {}

const ServerFrameJson = Schema.fromJsonString(LooseServerFrame)
const ClientFrameJson = Schema.fromJsonString(ClientFrame)

const transportError = (message: string): TransportError => TransportError.make({ message })

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const decodeServerText = (text: string): Effect.Effect<LooseServerFrameType, TransportError> =>
  Schema.decodeUnknownEffect(ServerFrameJson)(text).pipe(
    Effect.mapError((error) => error.pipe(errorMessage, transportError)),
  )

const encodeClientText = (frame: ClientFrameType): Effect.Effect<string, TransportError> =>
  Schema.encodeUnknownEffect(ClientFrameJson)(frame).pipe(
    Effect.mapError(() => transportError("failed to encode client frame")),
  )

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
  HttpClientResponse.stream(HttpClient.get(urlWithAfterSeq(options.url, options.afterSeq))).pipe(
    Stream.decodeText,
    Stream.pipeThroughChannel(Sse.decodeDataSchema(LooseServerFrame)),
    Stream.map((event) => event.data),
    Stream.mapError((error) => error.pipe(errorMessage, transportError)),
  )

const attachFrame = (sessionId: string, afterSeq: Option.Option<number>): ClientFrameType =>
  Option.match(afterSeq, {
    onNone: () => ({ _tag: "Attach", sessionId }),
    onSome: (seq) => ({ _tag: "Attach", sessionId, afterSeq: seq }),
  })

const reconnectDelay = (attempt: number): number => Math.min(100 * 2 ** attempt, 5_000)

/** @experimental */
export const layerWebSocket: Layer.Layer<AgentClient, never, Socket.WebSocketConstructor> = Layer.effect(
  AgentClient,
  Effect.gen(function* () {
    const constructor = yield* Socket.WebSocketConstructor

    return AgentClient.of({
      connect: (options) =>
        Effect.gen(function* () {
          const scope = yield* Effect.scope
          const framesQueue = yield* Queue.unbounded<LooseServerFrameType, TransportError>()
          const statusQueue = yield* Queue.unbounded<ConnectionStatus>()
          const writerRef = yield* Ref.make<
            Option.Option<(chunk: string | Uint8Array | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>>
          >(Option.none())
          const lastSeq = yield* Ref.make<Option.Option<number>>(Option.none())

          const writeClient = (frame: ClientFrameType): Effect.Effect<void, TransportError> =>
            Effect.gen(function* () {
              const writer = yield* Ref.get(writerRef)
              if (Option.isNone(writer)) return yield* transportError("WebSocket is not open")
              const text = yield* encodeClientText(frame)
              yield* writer.value(text).pipe(Effect.mapError((error) => transportError(error.message)))
            })

          const failFrames = (error: TransportError): Effect.Effect<never, TransportError> =>
            Queue.fail(framesQueue, error).pipe(Effect.andThen(Effect.fail(error)))

          const runSocket = (first: boolean, attempt: number): Effect.Effect<void> =>
            Queue.offer(statusQueue, first ? { _tag: "Connecting" } : { _tag: "Reconnecting" }).pipe(
              Effect.andThen(
                Effect.scoped(
                  Effect.gen(function* () {
                    const socket = yield* Socket.makeWebSocket(options.url).pipe(
                      Effect.provideService(Socket.WebSocketConstructor, constructor),
                    )
                    const writer = yield* socket.writer
                    const onOpen = Effect.gen(function* () {
                      yield* Ref.set(writerRef, Option.some(writer))
                      yield* Queue.offer(statusQueue, { _tag: "Open" })
                      const attach = attachFrame(options.sessionId, yield* Ref.get(lastSeq))
                      const encoded = yield* encodeClientText(attach).pipe(Effect.orDie)
                      yield* writer(encoded).pipe(Effect.orDie)
                    })
                    const handleServerText = (text: string) =>
                      decodeServerText(text).pipe(
                        Effect.matchEffect({
                          onFailure: failFrames,
                          onSuccess: (frame) =>
                            Ref.set(lastSeq, Option.some(frame.seq)).pipe(
                              Effect.andThen(Queue.offer(framesQueue, frame)),
                              Effect.asVoid,
                            ),
                        }),
                      )
                    const handleRaw = (data: string | Uint8Array) =>
                      typeof data === "string"
                        ? handleServerText(data)
                        : failFrames(transportError("binary server frame"))
                    yield* socket.runRaw(handleRaw, { onOpen })
                  }),
                ).pipe(Effect.ensuring(Ref.set(writerRef, Option.none()))),
              ),
              Effect.matchCauseEffect({
                onSuccess: () => Queue.offer(statusQueue, { _tag: "Closed" }).pipe(Effect.asVoid),
                onFailure: (cause) => {
                  if (Cause.hasInterrupts(cause)) return Effect.interrupt
                  const error = Cause.findErrorOption(cause)
                  if (Option.isSome(error) && Schema.is(TransportError)(error.value)) return Effect.void
                  return Effect.sleep(reconnectDelay(attempt)).pipe(Effect.andThen(runSocket(false, attempt + 1)))
                },
              }),
            )

          yield* runSocket(true, 0).pipe(Effect.forkIn(scope))
          yield* Effect.addFinalizer(() =>
            Queue.offer(statusQueue, { _tag: "Closed" }).pipe(
              Effect.andThen(Queue.shutdown(framesQueue)),
              Effect.andThen(Queue.shutdown(statusQueue)),
              Effect.asVoid,
            ),
          )

          return {
            frames: Stream.fromQueue(framesQueue),
            send: writeClient,
            status: Stream.fromQueue(statusQueue),
          }
        }),
    })
  }),
)
