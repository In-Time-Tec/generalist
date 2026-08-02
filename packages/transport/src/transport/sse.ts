import { Duration, Effect, Option, Schema, Stream } from "effect"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { HttpApiSchema } from "effect/unstable/httpapi"
import { TransportError, WireEncodeFailed } from "./errors.js"
import { SessionError, SessionRegistry } from "../session/session-registry.js"
import { codec, LooseServerFrame, SequenceFromString, ServerFrame } from "./wire.js"
import type {
  Capability,
  LooseServerFrameType,
  ServerFrameType,
  ToolkitInput,
  ToolkitServices,
  WireCodec,
} from "./wire.js"

type StreamSuccess<Data extends Schema.Constraint> = HttpApiSchema.StreamSse<
  HttpApiSchema.SseEventFromData<Data>,
  typeof TransportError,
  Data["Type"]
>
type Respond<R = never> = (options: {
  readonly sessionId: string
  readonly request: HttpServerRequest.HttpServerRequest
  readonly keepAlive?: Duration.Input
}) => Effect.Effect<HttpServerResponse.HttpServerResponse, SessionError, SessionRegistry | R>

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

/** @experimental Builds a fixed-tool SSE success schema using the supplied toolkit. */
export function streamSuccess<T extends ToolkitInput>(toolkit: T): StreamSuccess<ReturnType<typeof ServerFrame<T>>>
/** @experimental Builds a fixed-tool SSE success schema using an explicit capability. */
export function streamSuccess<T extends ToolkitInput>(capability: {
  readonly capability: "fixed"
  readonly toolkit: T
}): StreamSuccess<ReturnType<typeof ServerFrame<T>>>
/** @experimental Builds a runtime-dynamic SSE success schema. */
export function streamSuccess(capability: {
  readonly capability: "runtime-dynamic"
}): StreamSuccess<typeof LooseServerFrame>
/** @experimental Builds an SSE success schema from a capability selected by the caller. */
export function streamSuccess<T extends ToolkitInput>(
  capability: Capability<T>,
): StreamSuccess<ReturnType<typeof ServerFrame<T>> | typeof LooseServerFrame>
export function streamSuccess<T extends ToolkitInput>(input: T | Capability<T>): unknown {
  if ("tools" in input) {
    return HttpApiSchema.StreamSse({ data: ServerFrame(input), error: TransportError })
  }
  return HttpApiSchema.StreamSse({
    data: input.capability === "runtime-dynamic" ? LooseServerFrame : ServerFrame(input.toolkit),
    error: TransportError,
  })
}

const afterSeqFromRequest = (request: HttpServerRequest.HttpServerRequest): Option.Option<number> =>
  lastEventId(request.headers).pipe(Option.orElse(() => queryAfterSeq(request.url)))

const encodeDynamicFrame = (wireCodec: WireCodec<LooseServerFrameType>) => (frame: LooseServerFrameType) =>
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
const encodeFixedFrame =
  <T extends ToolkitInput>(toolkit: T, wireCodec: WireCodec<ServerFrameType<T>>) =>
  (frame: LooseServerFrameType) =>
    Schema.decodeUnknownEffect(ServerFrame(toolkit))(frame).pipe(
      Effect.flatMap(wireCodec.encodeServer),
      Effect.mapError((error) =>
        error instanceof WireEncodeFailed ? error : WireEncodeFailed.make({ message: String(error) }),
      ),
      Effect.map((data) => Sse.encoder.write({ _tag: "Event", id: String(frame.seq), event: frame._tag, data })),
    )

/** @experimental Builds a fixed-tool SSE responder using the supplied toolkit. */
export function respond<T extends ToolkitInput>(toolkit: T): Respond<ToolkitServices<T>>
/** @experimental Builds a fixed-tool SSE responder using an explicit capability. */
export function respond<T extends ToolkitInput>(capability: {
  readonly capability: "fixed"
  readonly toolkit: T
}): Respond<ToolkitServices<T>>
/** @experimental Builds a runtime-dynamic SSE responder. */
export function respond(capability: { readonly capability: "runtime-dynamic" }): Respond
/** @experimental Builds an SSE responder from a capability selected by the caller. */
export function respond<T extends ToolkitInput>(capability: Capability<T>): Respond<ToolkitServices<T>>
export function respond<T extends ToolkitInput>(input: T | Capability<T>): Respond<ToolkitServices<T>> {
  const capability = "tools" in input ? ({ capability: "fixed", toolkit: input } as const) : input
  const encode =
    capability.capability === "runtime-dynamic"
      ? encodeDynamicFrame(codec(capability))
      : encodeFixedFrame(capability.toolkit, codec(capability.toolkit))
  return (options) =>
    SessionRegistry.use((registry) => {
      const cursor = Option.getOrUndefined(afterSeqFromRequest(options.request))
      const frames = registry.attach(options.sessionId, cursor).pipe(Stream.mapEffect(encode))
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
}
