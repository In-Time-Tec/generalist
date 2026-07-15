import { Duration, Effect, Option, Schema, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TransportError } from "./errors.js"
import { SessionError, SessionRegistry } from "./session-registry.js"
import { codec, SequenceFromString, ServerFrame } from "./wire.js"
import type { LooseServerFrameType } from "./wire.js"

const cursorFromString = Schema.decodeUnknownOption(SequenceFromString)

const queryAfterSeq = (url: string): Option.Option<number> => {
  try {
    const parsed = new URL(url, "http://batonfx.local")
    const value = parsed.searchParams.get("after_seq")
    return value === null ? Option.none() : cursorFromString(value)
  } catch {
    return Option.none()
  }
}

/** @experimental */
export const lastEventId = (headers: Headers.Headers): Option.Option<number> =>
  Headers.get(headers, "last-event-id").pipe(Option.flatMap(cursorFromString))

/** @experimental */
export const streamSuccess = <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  HttpApiSchema.StreamSse({ data: ServerFrame(toolkit), error: TransportError })

const afterSeqFromRequest = (request: HttpServerRequest.HttpServerRequest): Option.Option<number> =>
  lastEventId(request.headers).pipe(Option.orElse(() => queryAfterSeq(request.url)))

const encodeFrame = (wireCodec: ReturnType<typeof codec>) => (frame: LooseServerFrameType) =>
  wireCodec.encodeServer(frame).pipe(
    Effect.map((data) =>
      Sse.encoder.write({
        _tag: "Event",
        id: String(frame.seq),
        event: frame._tag,
        data,
      }),
    ),
  )

/** @experimental */
export const respond =
  <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  (options: {
    readonly sessionId: string
    readonly request: HttpServerRequest.HttpServerRequest
    readonly keepAlive?: Duration.Input
  }): Effect.Effect<HttpServerResponse.HttpServerResponse, SessionError, SessionRegistry> =>
    SessionRegistry.use((registry) => {
      const cursor = Option.getOrUndefined(afterSeqFromRequest(options.request))
      const frames = registry.attach(options.sessionId, cursor).pipe(Stream.mapEffect(encodeFrame(codec(toolkit))))
      const heartbeats = Stream.tick(options.keepAlive ?? "15 seconds").pipe(Stream.map(() => ": keep-alive\n\n"))
      return Effect.succeed(
        HttpServerResponse.stream(frames.pipe(Stream.merge(heartbeats, { haltStrategy: "left" }), Stream.encodeText), {
          contentType: "text/event-stream",
          headers: {
            "cache-control": "no-cache",
            connection: "keep-alive",
            "baton-sse-version": "1",
          },
        }),
      )
    })
