import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Option, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { Sse } from "effect/unstable/encoding"
import { Headers, HttpBody, HttpServerRequest } from "effect/unstable/http"
import { Toolkit } from "effect/unstable/ai"
import { SessionRegistry, Wire } from "../src/index"
import { lastEventId, respond, streamSuccess } from "../src/sse"

const provideTestLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

const toolkit = Toolkit.empty

const endedFrame: Wire.LooseServerFrameType = { _tag: "Ended", seq: 1 }

const eventFrame: Wire.LooseServerFrameType = {
  _tag: "Event",
  seq: 0,
  event: { _tag: "TurnStarted", turn: 0 },
}

const registryLayer = (attach: SessionRegistry.Interface["attach"]): Layer.Layer<SessionRegistry.SessionRegistry> =>
  Layer.succeed(
    SessionRegistry.SessionRegistry,
    SessionRegistry.SessionRegistry.of({
      open: () => Effect.fail(SessionRegistry.SessionError.make({ message: "unused" })),
      send: () => Effect.void,
      resolveApproval: () => Effect.void,
      attach,
      interrupt: () => Effect.void,
      info: () => Effect.fail(SessionRegistry.SessionError.make({ message: "unused" })),
    }),
  )

const request = (url: string, headers: Headers.Input = {}): HttpServerRequest.HttpServerRequest =>
  ({
    url,
    originalUrl: url,
    headers: Headers.fromInput(headers),
  }) as HttpServerRequest.HttpServerRequest

const streamBodyText = (body: HttpBody.HttpBody) => {
  expect(body._tag).toBe("Stream")
  return body._tag === "Stream"
    ? body.stream.pipe(Stream.decodeText, Stream.runCollect, Effect.orDie)
    : Effect.succeed([])
}

const parseSse = (text: string): ReadonlyArray<Sse.Event> => {
  const parsed: Array<Sse.Event> = []
  const parser = Sse.makeParser((event) => {
    if (event._tag === "Event") parsed.push(event)
  })
  parser.feed(text)
  return parsed
}

describe("Sse", () => {
  it("parses Last-Event-ID as a non-negative integer", () => {
    expect(Option.getOrUndefined(lastEventId(Headers.fromInput({ "Last-Event-ID": "12" })))).toBe(12)
    expect(Option.isNone(lastEventId(Headers.fromInput({ "Last-Event-ID": "1.5" })))).toBe(true)
    expect(Option.isNone(lastEventId(Headers.fromInput({ "Last-Event-ID": "-1" })))).toBe(true)
  })

  it.effect("respond encodes registry frames as SSE events with seq ids", () =>
    Effect.gen(function* () {
      const response = yield* respond(toolkit)({
        sessionId: "s-sse",
        request: request("http://test/sessions/s-sse/events"),
      })
      const chunks = yield* streamBodyText(response.body)
      const events = parseSse(chunks.join(""))

      expect(response.headers["content-type"]).toBe("text/event-stream")
      expect(response.headers["cache-control"]).toBe("no-cache")
      expect(response.headers["baton-sse-version"]).toBe("1")
      expect(events.map((event) => event.id)).toEqual(["0", "1"])
      expect(events.map((event) => event.event)).toEqual(["Event", "Ended"])
      expect(
        events.map((event) => Schema.decodeUnknownSync(Schema.fromJsonString(Wire.LooseServerFrame))(event.data)._tag),
      ).toEqual(["Event", "Ended"])
    }).pipe(provideTestLayer(registryLayer(() => Stream.fromIterable([eventFrame, endedFrame])))),
  )

  it.effect("passes Last-Event-ID to SessionRegistry.attach before query fallback", () =>
    (() => {
      let received: number | undefined
      return Effect.gen(function* () {
        yield* respond(toolkit)({
          sessionId: "s-resume",
          request: request("http://test/sessions/s-resume/events?after_seq=3", { "Last-Event-ID": "4" }),
        })

        expect(received).toBe(4)
      }).pipe(
        provideTestLayer(
          registryLayer((_sessionId, afterSeq) => {
            received = afterSeq
            return Stream.fromIterable([endedFrame])
          }),
        ),
      )
    })(),
  )

  it.effect("falls back to after_seq query when Last-Event-ID is absent", () =>
    (() => {
      let received: number | undefined
      return Effect.gen(function* () {
        yield* respond(toolkit)({
          sessionId: "s-query",
          request: request("http://test/sessions/s-query/events?after_seq=7"),
        })

        expect(received).toBe(7)
      }).pipe(
        provideTestLayer(
          registryLayer((_sessionId, afterSeq) => {
            received = afterSeq
            return Stream.fromIterable([endedFrame])
          }),
        ),
      )
    })(),
  )

  it.effect("emits heartbeat comments without frame data", () =>
    Effect.gen(function* () {
      const response = yield* respond(toolkit)({
        sessionId: "s-heartbeat",
        request: request("http://test/sessions/s-heartbeat/events"),
        keepAlive: "10 millis",
      })
      expect(response.body._tag).toBe("Stream")
      const fiber = yield* response.body._tag === "Stream"
        ? response.body.stream.pipe(
            Stream.decodeText,
            Stream.take(1),
            Stream.runCollect,
            Effect.orDie,
            Effect.forkChild,
          )
        : Effect.die("expected stream body")

      yield* TestClock.adjust("10 millis")
      const chunks = yield* Fiber.join(fiber)

      expect(chunks.join("")).toContain(": keep-alive\n\n")
    }).pipe(provideTestLayer(registryLayer(() => Stream.never))),
  )

  it("exposes HttpApi StreamSse schema", () => {
    expect(streamSuccess(toolkit)._tag).toBe("StreamSse")
  })
})
