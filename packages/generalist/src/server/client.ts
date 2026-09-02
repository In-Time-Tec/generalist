import { Cause, Deferred, Effect, Fiber, Option, Queue, Ref, Schedule, Schema, Scope, Stream, Types } from "effect"
import { HttpClient, type HttpClientError } from "effect/unstable/http"
import { HttpApiClient } from "effect/unstable/httpapi"
import { Retry as SseRetry, type SseError } from "effect/unstable/encoding/Sse"
import { Socket } from "effect/unstable/socket"
import type { BudgetLimits } from "../core/durable/run-budget.js"
import type { EncodedAgentInput, SessionCreateOptions } from "../host/index.js"
import { HostEvent } from "../host/event.js"
import type { Decision } from "../runtime/operation/approval.js"
import type { UnknownResolution } from "../runtime/execution/recovery/operator.js"
import type { Cursor } from "../runtime/cursor.js"
import { api, type RunCancelPayload, type RunStartPayload } from "./api.js"
import { ApiError, InvalidConnectOptions, ReconnectExhausted, TransportError, Unauthorized } from "./errors.js"
import { encodeCommand, eventCodec, type ClientCommand } from "./wire.js"

type RawClient = HttpApiClient.ForApi<typeof api>

export type ConnectionStatus =
  | { readonly _tag: "Connecting" }
  | { readonly _tag: "Connected" }
  | { readonly _tag: "Disconnected"; readonly error: TransportError }
  | { readonly _tag: "Retrying"; readonly attempt: number }

export type ClientStreamError = ApiError | Unauthorized | TransportError
export type ReconnectSchedule = Schedule.Schedule<unknown, ClientStreamError>

export interface ConnectOptions {
  readonly sessionId: string
  readonly cursor?: Cursor
  readonly eventCapacity?: number
  readonly reconnect?: ReconnectSchedule
}

export interface Connection {
  readonly events: Stream.Stream<HostEvent, TransportError>
  readonly cancel: (runId: string, reason?: string) => Effect.Effect<void, TransportError>
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
  readonly sessions: {
    readonly create: (options?: SessionCreateOptions) => ReturnType<RawClient["sessions"]["create"]>
    readonly get: (options: { readonly sessionId: string }) => ReturnType<RawClient["sessions"]["get"]>
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
      readonly reason?: string
    }) => ReturnType<RawClient["runs"]["cancel"]>
  }
  readonly events: {
    readonly subscribe: (options: {
      readonly sessionId: string
      readonly cursor?: Cursor
      readonly reconnect?: ReconnectSchedule
    }) => Stream.Stream<HostEvent, ClientStreamError>
    readonly connect: (
      options: ConnectOptions,
    ) => Effect.Effect<Connection, InvalidConnectOptions, Scope.Scope | Socket.WebSocketConstructor>
  }
  readonly approvals: {
    readonly resolve: (options: {
      readonly runId: string
      readonly token: string
      readonly decision: Decision
      readonly operator: string
    }) => ReturnType<RawClient["approvals"]["resolve"]>
  }
  readonly operator: {
    readonly explain: (options: { readonly runId: string }) => ReturnType<RawClient["operator"]["explain"]>
    readonly retry: (options: {
      readonly runId: string
      readonly operator: string
    }) => ReturnType<RawClient["operator"]["retry"]>
    readonly wake: (options: {
      readonly runId: string
      readonly operator: string
    }) => ReturnType<RawClient["operator"]["wake"]>
    readonly resolveUnknown: (options: {
      readonly runId: string
      readonly operationId: string
      readonly resolution: UnknownResolution
      readonly operator: string
    }) => ReturnType<RawClient["operator"]["resolveUnknown"]>
    readonly extendBudget: (options: {
      readonly runId: string
      readonly delta: BudgetLimits
      readonly operator: string
    }) => ReturnType<RawClient["operator"]["extendBudget"]>
  }
}

const transportError = (message: string, kind?: TransportError["kind"]): TransportError =>
  TransportError.make(kind === undefined ? { message } : { message, kind })

const socketError = (error: Socket.SocketError): TransportError => transportError(error.message, "socket")

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

const clientError = (error: HttpError | TransportError): ApiError | Unauthorized | TransportError => {
  if (Schema.is(ApiError)(error) || Schema.is(Unauthorized)(error)) return error
  if (SseRetry.is(error)) return transportError("server requested SSE reconnect", "socket")
  return transportError(error.message, "socket")
}

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
                  if (item.id !== String(item.data.cursor)) {
                    return Effect.fail(transportError("SSE event ID does not match HostEvent cursor", "protocol"))
                  }
                  return Ref.set(cursorRef, item.data.cursor).pipe(Effect.as(item.data))
                }),
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
  urlFor: (cursor: Cursor | undefined) => string,
  options: ConnectOptions,
): Effect.Effect<Connection, InvalidConnectOptions, Scope.Scope | Socket.WebSocketConstructor> =>
  Effect.gen(function* () {
    const capacity = options.eventCapacity ?? 256
    if (!Number.isSafeInteger(capacity) || capacity <= 0) {
      return yield* InvalidConnectOptions.make({ message: "eventCapacity must be a positive safe integer" })
    }
    const constructor = yield* Socket.WebSocketConstructor
    const scope = yield* Effect.scope
    const eventQueue = yield* Queue.bounded<HostEvent, TransportError>(capacity)
    const statusQueue = yield* Queue.sliding<ConnectionStatus>(8)
    const writerRef = yield* Ref.make<Option.Option<(chunk: string) => Effect.Effect<void, TransportError>>>(
      Option.none(),
    )
    const cursorRef = yield* Ref.make(options.cursor)
    const attemptRef = yield* Ref.make(0)
    const exhausted = yield* Deferred.make<never, ReconnectExhausted>()

    const runSocket = Effect.suspend(() =>
      Effect.gen(function* () {
        const attempt = yield* Ref.getAndUpdate(attemptRef, (current) => current + 1)
        yield* Queue.offer(statusQueue, attempt === 0 ? { _tag: "Connecting" } : { _tag: "Retrying", attempt })
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
            const handleRaw = (data: string | Uint8Array): void => {
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
                    Queue.offer(eventQueue, event).pipe(Effect.andThen(Ref.set(cursorRef, event.cursor))),
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
      Effect.retry(options.reconnect ?? defaultReconnectSchedule),
      Effect.catch((error) => {
        const failure = ReconnectExhausted.make({ lastError: error })
        return Deferred.fail(exhausted, failure).pipe(Effect.andThen(Queue.fail(eventQueue, error)), Effect.asVoid)
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
      cancel: (runId, reason) =>
        send(reason === undefined ? { _tag: "Cancel", runId } : { _tag: "Cancel", runId, reason }),
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
    const websocketUrl = (sessionId: string, cursor: Cursor | undefined): string =>
      asWebSocketUrl(
        urls.events.connect({
          params: { id: sessionId },
          query: cursor === undefined ? {} : { cursor },
        }),
      )

    const value: Client = {
      sessions: {
        create: (sessionOptions = {}) => {
          const payload: Types.Mutable<SessionCreateOptions> = {}
          if (sessionOptions.id !== undefined) payload.id = sessionOptions.id
          if (sessionOptions.title !== undefined) payload.title = sessionOptions.title
          return raw.sessions.create({ payload })
        },
        get: ({ sessionId }) => raw.sessions.get({ params: { id: sessionId } }),
        list: () => raw.sessions.list({}),
      },
      runs: {
        start: (startOptions) => {
          const payload: Types.Mutable<RunStartPayload> = { agent: startOptions.agent, input: startOptions.input }
          if (startOptions.idempotencyKey !== undefined) payload.idempotencyKey = startOptions.idempotencyKey
          return raw.runs.start({ params: { sessionId: startOptions.sessionId }, payload })
        },
        list: ({ sessionId }) => raw.runs.list({ params: { sessionId } }),
        inspect: ({ runId }) => raw.runs.inspect({ params: { id: runId } }),
        cancel: ({ runId, reason }) => {
          const payload: Types.Mutable<RunCancelPayload> = {}
          if (reason !== undefined) payload.reason = reason
          return raw.runs.cancel({ params: { id: runId }, payload })
        },
      },
      events: {
        subscribe: (subscribeOptions) => subscribe(raw, subscribeOptions),
        connect: (connectOptions) =>
          connect((cursor) => websocketUrl(connectOptions.sessionId, cursor), connectOptions),
      },
      approvals: {
        resolve: ({ runId, token, decision, operator }) =>
          raw.approvals.resolve({ params: { id: runId, token }, payload: { decision, operator } }),
      },
      operator: {
        explain: ({ runId }) => raw.operator.explain({ params: { id: runId } }),
        retry: ({ runId, operator }) => raw.operator.retry({ params: { id: runId }, payload: { operator } }),
        wake: ({ runId, operator }) => raw.operator.wake({ params: { id: runId }, payload: { operator } }),
        resolveUnknown: ({ runId, operationId, resolution, operator }) =>
          raw.operator.resolveUnknown({
            params: { id: runId },
            payload: { operationId, resolution, operator },
          }),
        extendBudget: ({ runId, delta, operator }) =>
          raw.operator.extendBudget({ params: { id: runId }, payload: { delta, operator } }),
      },
    }
    return value
  })
