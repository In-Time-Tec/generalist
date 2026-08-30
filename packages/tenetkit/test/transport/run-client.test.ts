import { describe, expect, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Schema, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { RunClient, Wire } from "../../src/transport/index.js"
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
                  reconnect: { schedule: Schedule.recurs(1), retryable: () => true },
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
      },
    )
  }
})
