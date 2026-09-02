import { describe, expect, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Schema, Stream } from "effect"
import { HttpClient } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Server } from "generalist/server"
import { hostEvent } from "./fixtures.js"

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
    this.readyState = WebSocket.CLOSED
    const init: CloseEventInit = { code }
    if (reason !== undefined) init.reason = reason
    this.dispatchEvent(new CloseEvent("close", init))
  }

  open(): void {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event("open"))
  }

  message(data: string): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
}

const socketAt = (sockets: ReadonlyArray<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(() => {
    const socket = sockets[index]
    return socket === undefined
      ? Effect.yieldNow.pipe(Effect.andThen(socketAt(sockets, index)))
      : Effect.succeed(socket)
  })

const sentText = (value: string | Uint8Array | undefined): string => Schema.decodeUnknownSync(Schema.String)(value)

describe("Server client WebSocket", () => {
  const sockets: Array<FakeWebSocket> = []
  const resources = Layer.merge(
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die("unexpected HTTP request")),
    ),
    Layer.succeed(Socket.WebSocketConstructor, (url) => {
      const socket = new FakeWebSocket(url)
      sockets.push(socket)
      return socket
    }),
  )

  layer(resources, { excludeTestServices: true })("connection", (test) => {
    test.effect("reconnects from the last admitted Session cursor and sends explicit cancellation", () =>
      Effect.scoped(
        Effect.gen(function* () {
          sockets.length = 0
          const client = yield* Server.client({ baseUrl: "https://generalist.test" })
          const connection = yield* client.events.connect({
            sessionId: "session-1",
            eventCapacity: 1,
            reconnect: Schedule.recurs(1),
          })
          const first = yield* socketAt(sockets, 0)
          expect(first.url).toBe("wss://generalist.test/sessions/session-1/ws")
          first.open()

          const received = yield* connection.events.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
          first.message(yield* Server.eventCodec.encode(hostEvent(7)))
          expect(Array.from(yield* Fiber.join(received))).toEqual([hostEvent(7)])
          first.close(4000, "lagged:7")

          const second = yield* socketAt(sockets, 1)
          expect(second.url).toBe("wss://generalist.test/sessions/session-1/ws?cursor=7")
          second.open()
          yield* Effect.yieldNow
          yield* connection.cancel("run-1", "user")
          expect(
            yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(sentText(second.sent[0])),
          ).toEqual({
            _tag: "Cancel",
            runId: "run-1",
            reason: "user",
          })
        }),
      ),
    )

    test.effect("rejects an invalid event capacity before opening a socket", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const socketCount = sockets.length
          const client = yield* Server.client({ baseUrl: "https://generalist.test" })
          const failure = yield* client.events.connect({ sessionId: "invalid", eventCapacity: 0 }).pipe(Effect.flip)
          expect(Schema.is(Server.InvalidConnectOptions)(failure)).toBe(true)
          expect(sockets).toHaveLength(socketCount)
        }),
      ),
    )
  })
})
