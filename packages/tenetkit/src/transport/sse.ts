import { Duration, Effect, Option, Schema, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import type { Cursor } from "../runtime/cursor.js"
import type { RunEvent } from "../runtime/run/event.js"
import { Runtime, type EventsError } from "../runtime/service.js"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../runtime/errors.js"
import { InvalidCursor, WireEncodeFailed } from "./errors.js"
import { CursorFromString, ObserverRunEvent, observerCodec } from "./wire.js"

/** @experimental Typed errors that can terminate an SSE RunEvent stream. */
export type StreamError = EventsError | WireEncodeFailed
export const StreamError: Schema.Schema<StreamError> = Schema.Union([
  RunNotFound,
  CursorExpired,
  SubscriberLagged,
  RuntimeUnavailable,
  WireEncodeFailed,
])

const decodeCursor = (value: string): Effect.Effect<Cursor, InvalidCursor> =>
  Schema.decodeEffect(CursorFromString)(value).pipe(Effect.mapError(() => InvalidCursor.make({ value })))

const queryCursor = (url: string): Effect.Effect<Option.Option<Cursor>, InvalidCursor> => {
  try {
    const value = new URL(url, "http://tenetkit.local").searchParams.get("cursor")
    return value === null ? Effect.succeed(Option.none()) : decodeCursor(value).pipe(Effect.map(Option.some))
  } catch {
    return Effect.succeed(Option.none())
  }
}

/** @experimental Parses Last-Event-ID as an exclusive Runtime cursor. */
export const lastEventId = (headers: Headers.Headers): Effect.Effect<Option.Option<Cursor>, InvalidCursor> =>
  Option.match(Headers.get(headers, "last-event-id"), {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (value) => decodeCursor(value).pipe(Effect.map(Option.some)),
  })

const cursorFromRequest = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<Option.Option<Cursor>, InvalidCursor> =>
  lastEventId(request.headers).pipe(
    Effect.flatMap((cursor) => (Option.isSome(cursor) ? Effect.succeed(cursor) : queryCursor(request.url))),
  )

/** @experimental HttpApi success schema for canonical RunEvent SSE. */
type StreamSuccess = HttpApiSchema.StreamSse<
  HttpApiSchema.SseEventFromData<typeof ObserverRunEvent>,
  typeof StreamError,
  RunEvent
>

export const streamSuccess: StreamSuccess = HttpApiSchema.StreamSse({ data: ObserverRunEvent, error: StreamError })

interface EventsInput {
  runId: string
  cursor?: Cursor
}

/** @experimental Streams canonical Runtime RunEvents after the request cursor. */
export const respond = (options: {
  readonly runId: string
  readonly request: HttpServerRequest.HttpServerRequest
  readonly keepAlive?: Duration.Input
}): Effect.Effect<HttpServerResponse.HttpServerResponse, InvalidCursor, Runtime> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime
    const parsed = yield* cursorFromRequest(options.request)
    const cursor = Option.getOrUndefined(parsed)
    const eventInput: EventsInput = { runId: options.runId }
    if (cursor !== undefined) eventInput.cursor = cursor
    const events = runtime.events(eventInput).pipe(
      Stream.mapEffect((event) =>
        (event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
          ? runtime.resolveModelResponse(event).pipe(Effect.map((response) => ({ ...event, response })))
          : Effect.succeed(event)
        ).pipe(
          Effect.flatMap(observerCodec.encode),
          Effect.map((data) =>
            Sse.encoder.write({
              _tag: "Event",
              id: String(event.sequence),
              event: event._tag,
              data,
            }),
          ),
        ),
      ),
    )
    const heartbeats = Stream.tick(options.keepAlive ?? "15 seconds").pipe(Stream.map(() => ": keep-alive\n\n"))
    return HttpServerResponse.stream(
      events.pipe(Stream.merge(heartbeats, { haltStrategy: "left" }), Stream.encodeText),
      {
        contentType: "text/event-stream",
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "tenetkit-run-event-version": "1",
        },
      },
    )
  })

/** @experimental Decodes one canonical SSE event and verifies its cursor identity. */
export const decodeEvent = (
  event: Sse.Event,
): Effect.Effect<import("./wire.js").ResolvedRunEvent, InvalidCursor | WireEncodeFailed> =>
  event._tag === "Event" && event.id !== undefined
    ? decodeCursor(event.id).pipe(
        Effect.flatMap((cursor) =>
          observerCodec
            .decode(event.data)
            .pipe(
              Effect.flatMap((runEvent) =>
                cursor === runEvent.sequence
                  ? Effect.succeed(runEvent)
                  : Effect.fail(InvalidCursor.make({ value: event.id! })),
              ),
            ),
        ),
      )
    : Effect.fail(InvalidCursor.make({ value: "" }))
