import { Duration, Effect, Option, Schema, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { Cursor, Errors, RunEvent, Runtime } from "@batonfx/runtime"
import { InvalidCursor, WireEncodeFailed } from "./errors.js"
import { CursorFromString, ObserverRunEvent, producerCodec } from "./wire.js"

/** @experimental Typed errors that can terminate an SSE RunEvent stream. */
export type StreamError = Runtime.EventsError | WireEncodeFailed
export const StreamError: Schema.Schema<StreamError> = Schema.Union([
  Errors.RunNotFound,
  Errors.CursorExpired,
  Errors.SubscriberLagged,
  Errors.RuntimeUnavailable,
  WireEncodeFailed,
])

const decodeCursor = (value: string): Effect.Effect<Cursor.Cursor, InvalidCursor> =>
  Schema.decodeUnknownEffect(CursorFromString)(value).pipe(Effect.mapError(() => InvalidCursor.make({ value })))

const queryCursor = (url: string): Effect.Effect<Option.Option<Cursor.Cursor>, InvalidCursor> => {
  try {
    const value = new URL(url, "http://batonfx.local").searchParams.get("cursor")
    return value === null ? Effect.succeed(Option.none()) : decodeCursor(value).pipe(Effect.map(Option.some))
  } catch {
    return Effect.succeed(Option.none())
  }
}

/** @experimental Parses Last-Event-ID as an exclusive Runtime cursor. */
export const lastEventId = (headers: Headers.Headers): Effect.Effect<Option.Option<Cursor.Cursor>, InvalidCursor> =>
  Option.match(Headers.get(headers, "last-event-id"), {
    onNone: () => Effect.succeed(Option.none()),
    onSome: (value) => decodeCursor(value).pipe(Effect.map(Option.some)),
  })

const cursorFromRequest = (
  request: HttpServerRequest.HttpServerRequest,
): Effect.Effect<Option.Option<Cursor.Cursor>, InvalidCursor> =>
  lastEventId(request.headers).pipe(
    Effect.flatMap((cursor) => (Option.isSome(cursor) ? Effect.succeed(cursor) : queryCursor(request.url))),
  )

/** @experimental HttpApi success schema for canonical RunEvent SSE. */
type StreamSuccess = HttpApiSchema.StreamSse<
  HttpApiSchema.SseEventFromData<typeof ObserverRunEvent>,
  typeof StreamError,
  RunEvent.RunEvent
>

export const streamSuccess: StreamSuccess = HttpApiSchema.StreamSse({ data: ObserverRunEvent, error: StreamError })

/** @experimental Streams canonical Runtime RunEvents after the request cursor. */
export const respond = (options: {
  readonly runId: string
  readonly request: HttpServerRequest.HttpServerRequest
  readonly keepAlive?: Duration.Input
}): Effect.Effect<HttpServerResponse.HttpServerResponse, InvalidCursor, Runtime.Runtime> =>
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const parsed = yield* cursorFromRequest(options.request)
    const cursor = Option.getOrUndefined(parsed)
    const events = runtime.events({ runId: options.runId, ...(cursor === undefined ? {} : { cursor }) }).pipe(
      Stream.mapEffect((event) =>
        producerCodec.encode(event).pipe(
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
          "baton-run-event-version": "1",
        },
      },
    )
  })

/** @experimental Decodes one canonical SSE event and verifies its cursor identity. */
export const decodeEvent = (event: Sse.Event): Effect.Effect<RunEvent.RunEvent, InvalidCursor | WireEncodeFailed> =>
  event._tag === "Event" && event.id !== undefined
    ? decodeCursor(event.id).pipe(
        Effect.flatMap((cursor) =>
          producerCodec
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
