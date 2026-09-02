import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Ref, Schedule, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Chaos, Errors, RunClient, Wire } from "../../../src/unstable/transport/index.js"
import { event } from "./fixtures.js"

class FakeWebSocket extends EventTarget implements WebSocket {
  readonly CONNECTING = WebSocket.CONNECTING
  readonly OPEN = WebSocket.OPEN
  readonly CLOSING = WebSocket.CLOSING
  readonly CLOSED = WebSocket.CLOSED
  readonly extensions = ""
  readonly protocol = ""
  readonly sent: Array<string | Uint8Array> = []
  readyState: 0 | 1 | 2 | 3 = WebSocket.CONNECTING
  binaryType: BinaryType = "blob"
  bufferedAmount = 0
  onclose: WebSocket["onclose"] = null
  onerror: WebSocket["onerror"] = null
  onmessage: WebSocket["onmessage"] = null
  onopen: WebSocket["onopen"] = null

  constructor(readonly url: string) {
    super()
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(Schema.decodeUnknownSync(Schema.Union([Schema.String, Schema.Uint8Array]))(data))
  }

  close(code = 1000, reason?: string): void {
    this.readyState = 3
    const init: CloseEventInit = { code }
    if (reason !== undefined) init.reason = reason
    this.dispatchEvent(new CloseEvent("close", init))
  }

  open(): void {
    this.readyState = 1
    this.dispatchEvent(new Event("open"))
  }

  message(data: string): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
}

const sentText = (value: string | Uint8Array | undefined): string => Schema.decodeUnknownSync(Schema.String)(value)

const socketAt = (sockets: ReadonlyArray<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(() => {
    const socket = sockets[index]
    return socket === undefined
      ? Effect.yieldNow.pipe(Effect.andThen(socketAt(sockets, index)))
      : Effect.succeed(socket)
  })

describe("RunClient", () => {
  it.effect("uses jittered reconnect delays and stops after two elapsed minutes", () =>
    Effect.gen(function* () {
      const failure = Errors.TransportError.make({ message: "offline", kind: "socket" })
      const attempts = yield* Ref.make(0)
      const fiber = yield* Ref.update(attempts, (current) => current + 1).pipe(
        Effect.andThen(Effect.fail(failure)),
        Effect.retry(RunClient.defaultReconnectSchedule),
        Effect.flip,
        Effect.forkChild,
      )
      yield* Effect.yieldNow

      expect(yield* Ref.get(attempts)).toBe(1)
      yield* TestClock.adjust("199 millis")
      expect(yield* Ref.get(attempts)).toBe(1)
      yield* TestClock.adjust("101 millis")
      expect(yield* Ref.get(attempts)).toBe(2)
      yield* TestClock.adjust("10 minutes")

      expect(yield* Fiber.join(fiber)).toBe(failure)
      expect(yield* Ref.get(attempts)).toBeGreaterThan(1)
    }),
  )

  {
    const cursors: Array<number | undefined> = []
    const sourceEvents = [event(0), event(1), event(2)]
    const frames = sourceEvents.map(
      (item) => `id: ${item.sequence}\ndata: ${Effect.runSync(Wire.producerCodec.encode(item))}\n\n`,
    )
    const client = HttpClient.make((request, url) =>
      Effect.sync(() => {
        const cursorText = url.searchParams.get("cursor")
        const cursor = cursorText === null ? undefined : Number(cursorText)
        cursors.push(cursor)
        return HttpClientResponse.fromWeb(
          request,
          new Response(frames.filter((_, index) => sourceEvents[index]!.sequence > (cursor ?? -1)).join(""), {
            headers: { "content-type": "text/event-stream" },
          }),
        )
      }),
    )
    const testLayer = Layer.merge(Layer.succeed(HttpClient.HttpClient, client), Chaos.dropConnection(2))
    layer(testLayer, { excludeTestServices: true })("SSE reconnect", (suite) => {
      suite.effect("resumes after the last event without duplicates", () =>
        RunClient.streamSSE({ url: "https://test/runs/run-1/events", reconnect: Schedule.recurs(1) }).pipe(
          Stream.runCollect,
          Effect.map((events) => {
            expect(events.map((item) => item.sequence)).toEqual([0, 1, 2])
            expect(cursors).toEqual([undefined, 1])
          }),
        ),
      )
    })
  }

  {
    const sockets: Array<FakeWebSocket> = []
    const webSocketConstructor = Layer.succeed(Socket.WebSocketConstructor, (url) => {
      const socket = new FakeWebSocket(url)
      sockets.push(socket)
      return socket
    })
    layer(RunClient.layerWebSocket.pipe(Layer.provide(webSocketConstructor)), { excludeTestServices: true })(
      "reconnects from the last RunEvent admitted to its bounded queue",
      (suite) => {
        suite.effect("reconnects from the last RunEvent admitted to its bounded queue", () =>
          Effect.scoped(
            Effect.gen(function* () {
              const connection = yield* RunClient.RunClient.use((client) =>
                client.connect({
                  url: "ws://test/runs",
                  runId: "run-1",
                  eventCapacity: 1,
                  reconnect: Schedule.recurs(1),
                }),
              )
              const first = yield* socketAt(sockets, 0)
              first.open()
              yield* Effect.yieldNow
              expect(yield* Wire.decodeCommand(sentText(first.sent[0]))).toEqual({ _tag: "Attach", runId: "run-1" })

              const received = connection.events.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
              first.message(yield* Wire.producerCodec.encode(event(7)))
              yield* Fiber.join(yield* received)
              first.close(4000, "lagged:7")

              const second = yield* socketAt(sockets, 1)
              second.open()
              yield* Effect.yieldNow
              expect(yield* Wire.decodeCommand(sentText(second.sent[0]))).toEqual({
                _tag: "Attach",
                runId: "run-1",
                cursor: 7,
              })

              yield* connection.cancel("user")
              expect(yield* Wire.decodeCommand(sentText(second.sent[1]))).toEqual({
                _tag: "Cancel",
                runId: "run-1",
                reason: "user",
              })
            }),
          ),
        )
        suite.effect("rejects an invalid event capacity as a typed failure", () =>
          Effect.scoped(
            Effect.gen(function* () {
              const socketCount = sockets.length
              const failure = yield* RunClient.RunClient.use((client) =>
                client.connect({
                  url: "ws://test/runs",
                  runId: "run-invalid",
                  eventCapacity: 0,
                }),
              ).pipe(Effect.flip)

              expect(Schema.is(RunClient.InvalidConnectOptions)(failure)).toBe(true)
              expect(sockets).toHaveLength(socketCount)
            }),
          ),
        )
      },
    )
  }
})
