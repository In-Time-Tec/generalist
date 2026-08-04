import { describe, expect, it } from "@effect/vitest"
import { Effect, Ref, Stream } from "effect"
import { Sse as SseEncoding } from "effect/unstable/encoding"
import { Headers, HttpBody, HttpServerRequest } from "effect/unstable/http"
import { Sse, Wire } from "../src/index.js"
import { runtimeLayer } from "./helpers.js"

const request = (url: string, headers: Headers.Input = {}): HttpServerRequest.HttpServerRequest =>
  ({ url, originalUrl: url, headers: Headers.fromInput(headers) }) as HttpServerRequest.HttpServerRequest

const bodyText = (body: HttpBody.HttpBody) =>
  body._tag === "Stream"
    ? body.stream.pipe(
        Stream.take(1),
        Stream.decodeText,
        Stream.runCollect,
        Effect.map((chunks) => chunks.join("")),
      )
    : Effect.die("expected stream body")

const parse = (text: string): ReadonlyArray<SseEncoding.Event> => {
  const events: Array<SseEncoding.Event> = []
  const parser = SseEncoding.makeParser((event) => {
    if (event._tag === "Event") events.push(event)
  })
  parser.feed(text)
  return events
}

describe("Sse", () => {
  it.live("replays events strictly after Last-Event-ID", () =>
    Effect.gen(function* () {
      const cursors = yield* Ref.make<Array<number | undefined>>([])
      const layer = runtimeLayer({
        events: ({ cursor }) =>
          Stream.fromEffect(Ref.update(cursors, (values) => [...values, cursor])).pipe(
            Stream.drain,
            Stream.concat(runtimeLayerEvents(cursor)),
          ),
      })
      const response = yield* Sse.respond({
        runId: "run-1",
        request: request("http://test/runs/run-1/events?cursor=0", { "Last-Event-ID": "1" }),
      }).pipe(Effect.provide(layer))
      const events = parse(yield* bodyText(response.body))

      expect(yield* Ref.get(cursors)).toEqual([1])
      expect(events.map((item) => item.id)).toEqual(["2"])
      expect((yield* Wire.observerCodec.decode(events[0]!.data)).sequence).toBe(2)
      expect(response.headers["baton-run-event-version"]).toBe("1")
    }),
  )

  it.effect("rejects malformed cursors instead of silently replaying from origin", () =>
    Sse.respond({ runId: "run-1", request: request("http://test/runs/run-1/events?cursor=wat") }).pipe(
      Effect.provide(runtimeLayer()),
      Effect.flip,
      Effect.map((error) => expect(error._tag).toBe("@batonfx/transport/InvalidCursor")),
    ),
  )
})

import { event } from "./helpers.js"
const runtimeLayerEvents = (cursor: number | undefined) =>
  Stream.fromIterable([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1)))
