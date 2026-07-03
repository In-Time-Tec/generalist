import { Duration, Effect, Option, Schema, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import * as Ai from "effect/unstable/ai"
import * as Errors from "./errors"
import * as SessionRegistry from "./session-registry"
import * as Wire from "./wire"

const cursorFromString = (value: string): Option.Option<number> => {
  if (!/^\d+$/.test(value)) return Option.none()
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? Option.some(parsed) : Option.none()
}

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
export const streamSuccess = <T extends Ai.Toolkit.Any | Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>(
  toolkit: T,
) => HttpApiSchema.StreamSse({ data: Wire.ServerFrame(toolkit), error: Errors.TransportError })

const afterSeqFromRequest = (request: HttpServerRequest.HttpServerRequest): Option.Option<number> =>
  lastEventId(request.headers).pipe(Option.orElse(() => queryAfterSeq(request.url)))

const encodeFrame =
  <T extends Ai.Toolkit.Any | Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>(toolkit: T) =>
  (frame: Wire.LooseServerFrameType): string => {
    const encoded = Schema.encodeUnknownSync(Wire.ServerFrame(toolkit))(frame)
    return Sse.encoder.write({
      _tag: "Event",
      id: String(frame.seq),
      event: frame._tag,
      data: JSON.stringify(encoded),
    })
  }

/** @experimental */
export const respond =
  <T extends Ai.Toolkit.Any | Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>(toolkit: T) =>
  (options: {
    readonly sessionId: string
    readonly request: HttpServerRequest.HttpServerRequest
    readonly keepAlive?: Duration.Input
  }): Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    SessionRegistry.SessionError,
    SessionRegistry.SessionRegistry
  > =>
    SessionRegistry.SessionRegistry.use((registry) => {
      const cursor = Option.getOrUndefined(afterSeqFromRequest(options.request))
      const frames = registry.attach(options.sessionId, cursor).pipe(Stream.map(encodeFrame(toolkit)))
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
