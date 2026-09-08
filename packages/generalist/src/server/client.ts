import {
  Cause,
  Deferred,
  Effect,
  Fiber,
  Option,
  Queue,
  Ref,
  Result,
  Schedule,
  Schema,
  Scope,
  Stream,
  Types,
} from "effect"
import { HttpClient, type HttpClientError } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { Retry as SseRetry, type SseError } from "effect/unstable/encoding/Sse"
import { Socket } from "effect/unstable/socket"
import type { BudgetLimits } from "../core/durable/run-budget.js"
import type { Put as BlobPut } from "../blob-store/index.js"
import type { EncodedAgentInput } from "../host/index.js"
import { HostEvent } from "../host/event.js"
import type { Decision } from "../runtime/operation/approval.js"
import type { UnknownResolution } from "../runtime/execution/recovery/operator.js"
import type { Cursor } from "../runtime/cursor.js"
import type { HostSessionSnapshot } from "../runtime/session/host.js"
import { make as makeSessionClient, type SessionClient } from "./session-client.js"
import { api, type RunCancelPayload, type RunMessagePayload, type RunStartPayload } from "./api.js"
import { ApiError, InvalidConnectOptions, ReconnectExhausted, TransportError, Unauthorized } from "./errors.js"
import { encodeCommand, eventCodec, type ClientCommand, type ServerEvent } from "./wire.js"

type RawClient = HttpApiClient.ForApi<typeof api>
type SnapshotError = Effect.Error<ReturnType<RawClient["sessions"]["snapshot"]>>
type SocketClientError = HttpError | TransportError | SnapshotError

export type ConnectionStatus =
  | { readonly _tag: "Connecting"; readonly epoch: number }
  | { readonly _tag: "Connected"; readonly epoch: number }
  | { readonly _tag: "Disconnected"; readonly epoch: number; readonly error: TransportError }
  | { readonly _tag: "Retrying"; readonly epoch: number; readonly attempt: number }

export type ClientStreamError = ApiError | Unauthorized | TransportError
export type ReconnectSchedule = Schedule.Schedule<unknown, ClientStreamError>
/** Maximum lifecycle statuses retained while a consumer is backlogged. */
export const ConnectionStatusCapacity = 8

/** A committed snapshot loaded before a replacement WebSocket starts delivering events. */
export interface ConnectionSnapshot {
  readonly _tag: "ConnectionSnapshot"
  /** The originating WebSocket attempt epoch, including attempts whose snapshot load failed. */
  readonly epoch: number
  readonly snapshot: HostSessionSnapshot
}
export type ConnectionEvent = ServerEvent | ConnectionSnapshot

export interface ConnectOptions {
  readonly sessionId: string
  readonly eventCapacity?: number
  readonly reconnect?: ReconnectSchedule
}

export interface Connection {
  readonly snapshot: HostSessionSnapshot
  readonly events: Stream.Stream<ConnectionEvent, TransportError>
  readonly cancel: (runId: string, commandId: string, reason?: string) => Effect.Effect<void, TransportError>
  readonly status: Stream.Stream<ConnectionStatus>
  readonly exhausted: Effect.Effect<never, ReconnectExhausted>
}

export type HttpError =
  | ApiError
  | Unauthorized
  | HttpClientError.HttpClientError
  | Schema.SchemaError
  | SseRetry
  | SseError

export interface Client {
  readonly attachments: {
    readonly put: (input: BlobPut) => ReturnType<RawClient["attachments"]["put"]>
    readonly get: (options: { readonly sha256: string }) => ReturnType<RawClient["attachments"]["get"]>
  }
  readonly sessions: SessionClient & {
    readonly list: () => ReturnType<RawClient["sessions"]["list"]>
  }
  readonly runs: {
    readonly start: (options: {
      readonly sessionId: string
      readonly agent: string
      readonly input: EncodedAgentInput
      readonly idempotencyKey?: string
    }) => ReturnType<RawClient["runs"]["start"]>
    readonly list: (options: { readonly sessionId: string }) => ReturnType<RawClient["runs"]["list"]>
    readonly inspect: (options: { readonly runId: string }) => ReturnType<RawClient["runs"]["inspect"]>
    readonly cancel: (options: {
      readonly runId: string
      readonly commandId: string
      readonly reason?: string
    }) => ReturnType<RawClient["runs"]["cancel"]>
    readonly message: (options: {
      readonly runId: string
      readonly commandId: string
      readonly input: RunMessagePayload["input"]
    }) => ReturnType<RawClient["runs"]["message"]>
    readonly messages: (options: {
      readonly runId: string
      readonly limit?: number
    }) => ReturnType<RawClient["runs"]["messages"]>
  }
  readonly events: {
    readonly subscribe: (options: {
      readonly sessionId: string
      readonly cursor?: Cursor
      readonly reconnect?: ReconnectSchedule
    }) => Stream.Stream<HostEvent, ClientStreamError>
    readonly connect: (
      options: ConnectOptions,
    ) => Effect.Effect<Connection, InvalidConnectOptions | HttpError, Scope.Scope | Socket.WebSocketConstructor>
  }
  readonly approvals: {
    readonly resolve: (options: {
      readonly runId: string
      readonly token: string
      readonly decision: Decision
    }) => ReturnType<RawClient["approvals"]["resolve"]>
  }
  readonly operator: {
    readonly explain: (options: { readonly runId: string }) => ReturnType<RawClient["operator"]["explain"]>
    readonly retry: (options: {
      readonly runId: string
      readonly commandId: string
    }) => ReturnType<RawClient["operator"]["retry"]>
    readonly wake: (options: {
      readonly runId: string
      readonly commandId: string
    }) => ReturnType<RawClient["operator"]["wake"]>
    readonly resolveUnknown: (options: {
      readonly runId: string
      readonly commandId: string
      readonly operationId: string
      readonly resolution: UnknownResolution
    }) => ReturnType<RawClient["operator"]["resolveUnknown"]>
    readonly extendBudget: (options: {
      readonly runId: string
      readonly commandId: string
      readonly delta: BudgetLimits
    }) => ReturnType<RawClient["operator"]["extendBudget"]>
  }
}

const transportError = (message: string, kind?: TransportError["kind"]): TransportError =>
  TransportError.make(kind === undefined ? { message } : { message, kind })

const socketError = (error: Socket.SocketError): TransportError => {
  if (error.reason._tag === "SocketCloseError") {
    if (error.reason.code === 4001) return transportError(error.message, "cursor-expired")
    if (error.reason.code === 4000) return transportError(error.message, "lagged")
  }
  return transportError(error.message, "socket")
}

const reconnectBackoff = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ duration: "2 minutes" }),
)

/** Jittered socket reconnect backoff bounded by two elapsed minutes. */
export const defaultReconnectSchedule: ReconnectSchedule = reconnectBackoff.pipe(
  Schedule.while(({ input }) => Schema.is(TransportError)(input) && input.kind === "socket"),
)

const asWebSocketUrl = (url: string): string => {
  const parsed = new URL(url)
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
  return parsed.toString()
}

const errorMessage = (error: SocketClientError): string =>
  error instanceof Error ? error.message : "Server client transport failed"

const clientError = (error: SocketClientError): ApiError | Unauthorized | TransportError => {
  if (Schema.is(ApiError)(error) || Schema.is(Unauthorized)(error)) return error
  if (SseRetry.is(error)) return transportError("server requested SSE reconnect", "socket")
  return transportError(errorMessage(error), "socket")
}

const reconnectError = (error: SocketClientError): TransportError =>
  Schema.is(TransportError)(error) ? error : transportError(errorMessage(error), "socket")

const subscribe = (
  raw: RawClient,
  options: { readonly sessionId: string; readonly cursor?: Cursor; readonly reconnect?: ReconnectSchedule },
): Stream.Stream<HostEvent, ClientStreamError> =>
  Stream.unwrap(
    Ref.make(options.cursor).pipe(
      Effect.map((cursorRef) => {
        const attempt = Stream.unwrap(
          Ref.get(cursorRef).pipe(
            Effect.flatMap((cursor) =>
              raw.events.subscribe({
                params: { id: options.sessionId },
                query: {},
                headers: cursor === undefined ? {} : { "last-event-id": cursor },
              }),
            ),
            Effect.map((events) =>
              events.pipe(
                Stream.mapEffect((item) => {
                  if (item.data.sessionId !== options.sessionId) {
                    return Effect.fail(transportError("HostEvent belongs to another Session", "protocol"))
                  }
                  if (item.id !== String(item.data.cursor)) {
                    return Effect.fail(transportError("SSE event ID does not match HostEvent cursor", "protocol"))
                  }
                  return Ref.get(cursorRef).pipe(
                    Effect.flatMap((cursor) => {
                      if (cursor !== undefined && item.data.cursor <= cursor)
                        return Effect.succeed(Option.none<HostEvent>())
                      return Ref.set(cursorRef, item.data.cursor).pipe(Effect.as(Option.some(item.data)))
                    }),
                  )
                }),
                Stream.filterMap((event) =>
                  Option.match(event, { onNone: () => Result.fail(undefined), onSome: Result.succeed }),
                ),
                Stream.mapError(clientError),
              ),
            ),
            Effect.mapError(clientError),
          ),
        )
        return attempt.pipe(Stream.retry(options.reconnect ?? defaultReconnectSchedule))
      }),
    ),
  )

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

const connect = (
  loadSnapshot: Effect.Effect<HostSessionSnapshot, HttpError>,
  urlFor: (cursor: Cursor | undefined) => string,
  options: ConnectOptions,
): Effect.Effect<Connection, InvalidConnectOptions | HttpError, Scope.Scope | Socket.WebSocketConstructor> =>
  Effect.gen(function* () {
    const capacity = options.eventCapacity ?? 256
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      return yield* InvalidConnectOptions.make({ message: "eventCapacity must be a positive safe integer" })
    }
    const snapshot = yield* loadSnapshot
    const constructor = yield* Socket.WebSocketConstructor
    const scope = yield* Effect.scope
    const eventQueue = yield* Queue.bounded<ConnectionEvent, TransportError>(capacity)
    const statusQueue = yield* Queue.sliding<ConnectionStatus>(ConnectionStatusCapacity)
    const writerRef = yield* Ref.make<Option.Option<(chunk: string) => Effect.Effect<void, TransportError>>>(
      Option.none(),
    )
    const cursorRef = yield* Ref.make(snapshot.cursor)
    const attemptRef = yield* Ref.make(0)
    const exhausted = yield* Deferred.make<never, ReconnectExhausted>()

    const runSocket = Effect.suspend(() =>
      Effect.gen(function* () {
        const attempt = yield* Ref.getAndUpdate(attemptRef, (current) => current + 1)
        if (attempt > 0) {
          const replacement = yield* loadSnapshot.pipe(Effect.mapError(clientError))
          yield* Ref.set(cursorRef, replacement.cursor)
          yield* Queue.offer(eventQueue, { _tag: "ConnectionSnapshot", epoch: attempt, snapshot: replacement })
        }
        yield* Queue.offer(
          statusQueue,
          attempt === 0 ? { _tag: "Connecting", epoch: attempt } : { _tag: "Retrying", epoch: attempt, attempt },
        )
        yield* Effect.scoped(
          Effect.gen(function* () {
            const cursor = yield* Ref.get(cursorRef)
            const socket = yield* Socket.makeWebSocket(urlFor(cursor)).pipe(
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
            let active = true
            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                active = false
              }),
            )
            const handleRaw = (data: string | Uint8Array): void => {
              if (!active) return
              if (data instanceof Uint8Array) {
                Deferred.doneUnsafe(overflow, Effect.fail(transportError("binary HostEvent", "protocol")))
              } else if (!Queue.offerUnsafe(ingress, data)) {
                Deferred.doneUnsafe(overflow, Effect.fail(transportError("event buffer capacity exceeded", "socket")))
              }
            }
            yield* Stream.fromQueue(ingress).pipe(
              Stream.runForEach((text) =>
                eventCodec.decode(text).pipe(
                  Effect.mapError((error) => transportError(error.message, "protocol")),
                  Effect.flatMap((event) =>
                    Effect.gen(function* () {
                      if (!active) return
                      if (event.sessionId !== options.sessionId)
                        return yield* transportError("HostEvent belongs to another Session", "protocol")
                      if (event._tag === "PreviewDelivery") {
                        if (
                          event.runId !== event.event.runId ||
                          event.authorityAttemptFence !== event.event.attemptFence
                        ) {
                          return yield* transportError("preview delivery does not match Host authority", "protocol")
                        }
                        yield* Queue.offer(eventQueue, event)
                        return
                      }
                      const admittedCursor = yield* Ref.get(cursorRef)
                      if (event.cursor <= admittedCursor) return
                      yield* Queue.offer(eventQueue, event)
                      yield* Ref.set(cursorRef, event.cursor)
                    }),
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
            yield* Ref.set(writerRef, Option.some(write))
            yield* Queue.offer(statusQueue, { _tag: "Connected", epoch: attempt })
            yield* Deferred.await(done)
          }),
        ).pipe(
          Effect.ensuring(Ref.set(writerRef, Option.none())),
          Effect.tapError((error) => Queue.offer(statusQueue, { _tag: "Disconnected", epoch: attempt, error })),
        )
      }),
    )

    const runClient = runSocket.pipe(
      Effect.retry(options.reconnect ?? defaultReconnectSchedule),
      Effect.catch((error) => {
        const lastError = reconnectError(error)
        const failure = ReconnectExhausted.make({ lastError })
        return Deferred.fail(exhausted, failure).pipe(Effect.andThen(Queue.fail(eventQueue, lastError)), Effect.asVoid)
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
      snapshot,
      events: Stream.fromQueue(eventQueue),
      cancel: (runId, commandId, reason) =>
        send(
          reason === undefined ? { _tag: "Cancel", runId, commandId } : { _tag: "Cancel", runId, commandId, reason },
        ),
      status: Stream.fromQueue(statusQueue),
      exhausted: Deferred.await(exhausted),
    }
  })

/** Build the typed client from the same HttpApi declaration used by Server.layer. */
export const client = (options: {
  readonly baseUrl: string | URL
}): Effect.Effect<Client, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const raw = yield* HttpApiClient.make(api, { baseUrl: options.baseUrl })
    const urls = HttpApiClient.urlBuilder(api, { baseUrl: options.baseUrl })
    const basePath = new URL(options.baseUrl).pathname.replace(/\/$/, "")
    const websocketUrl = (sessionId: string, cursor: Cursor | undefined): string => {
      const url = new URL(
        urls.events.connect({
          params: { id: sessionId },
          query: cursor === undefined ? {} : { cursor },
        }),
      )
      url.pathname = `${basePath}${url.pathname}`
      return asWebSocketUrl(url.toString())
    }

    const value: Client = {
      attachments: {
        put: (input) =>
          raw.attachments.put({
            headers: {
              "x-media-type": input.mediaType,
              ...(input.filename === undefined ? undefined : { "x-filename": input.filename }),
            },
            payload: input.data,
          }),
        get: ({ sha256 }) => raw.attachments.get({ params: { sha256 } }),
      },
      sessions: { ...makeSessionClient(raw.sessions), list: () => raw.sessions.list({}) },
      runs: {
        start: (startOptions) => {
          const payload: Types.Mutable<RunStartPayload> = { agent: startOptions.agent, input: startOptions.input }
          if (startOptions.idempotencyKey !== undefined) payload.idempotencyKey = startOptions.idempotencyKey
          return raw.runs.start({ params: { sessionId: startOptions.sessionId }, payload })
        },
        list: ({ sessionId }) => raw.runs.list({ params: { sessionId } }),
        inspect: ({ runId }) => raw.runs.inspect({ params: { id: runId } }),
        cancel: ({ runId, commandId, reason }) => {
          const payload: Types.Mutable<RunCancelPayload> = { commandId }
          if (reason !== undefined) payload.reason = reason
          return raw.runs.cancel({ params: { id: runId }, payload })
        },
        message: ({ runId, commandId, input }) =>
          raw.runs.message({ params: { id: runId }, payload: { commandId, input } }),
        messages: ({ runId, limit }) =>
          raw.runs.messages({ params: { id: runId }, query: limit === undefined ? {} : { limit } }),
      },
      events: {
        subscribe: (subscribeOptions) => subscribe(raw, subscribeOptions),
        connect: (connectOptions) =>
          connect(
            raw.sessions.snapshot({ params: { id: connectOptions.sessionId } }),
            (cursor) => websocketUrl(connectOptions.sessionId, cursor),
            connectOptions,
          ),
      },
      approvals: {
        resolve: ({ runId, token, decision }) =>
          raw.approvals.resolve({ params: { id: runId, token }, payload: { decision } }),
      },
      operator: {
        explain: ({ runId }) => raw.operator.explain({ params: { id: runId } }),
        retry: ({ runId, commandId }) => raw.operator.retry({ params: { id: runId }, payload: { commandId } }),
        wake: ({ runId, commandId }) => raw.operator.wake({ params: { id: runId }, payload: { commandId } }),
        resolveUnknown: ({ runId, commandId, operationId, resolution }) =>
          raw.operator.resolveUnknown({
            params: { id: runId },
            payload: { commandId, operationId, resolution },
          }),
        extendBudget: ({ runId, commandId, delta }) =>
          raw.operator.extendBudget({ params: { id: runId }, payload: { commandId, delta } }),
      },
    }
    return value
  })
