import { describe, expect, layer } from "@effect/vitest"
import { Effect, Fiber, Layer, Schedule, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { Client, Wire } from "../src/index.js"
import { event } from "./helpers.js"

class FakeWebSocket {
  readonly sent: Array<string | Uint8Array> = []
  readyState = 0
  binaryType: BinaryType = "blob"
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>()

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    )
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
  }

  close(code = 1000, reason?: string): void {
    this.readyState = 3
    this.emit("close", { code, reason })
  }

  open(): void {
    this.readyState = 1
    this.emit("open", {})
  }

  message(data: string): void {
    this.emit("message", { data })
  }

  private emit(type: string, value: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(value)
  }
}

const socketAt = (sockets: ReadonlyArray<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(() => {
    const socket = sockets[index]
    return socket === undefined
      ? Effect.yieldNow.pipe(Effect.andThen(socketAt(sockets, index)))
      : Effect.succeed(socket)
  })

describe("Client", () => {
  {
    const sockets: Array<FakeWebSocket> = []
    const constructor = Layer.succeed(Socket.WebSocketConstructor, (url) => {
      const socket = new FakeWebSocket(String(url))
      sockets.push(socket)
      return socket as unknown as WebSocket
    })
    layer(Client.layerWebSocket.pipe(Layer.provide(constructor)), { excludeTestServices: true })(
      "reconnects from the last RunEvent admitted to its bounded queue",
      (suite) => {
        suite.effect("reconnects from the last RunEvent admitted to its bounded queue", () =>
          Effect.scoped(
            Effect.gen(function* () {
              const connection = yield* Client.RunClient.use((client) =>
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
              expect(yield* Wire.decodeCommand(first.sent[0] as string)).toEqual({ _tag: "Attach", runId: "run-1" })

              const received = connection.events.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
              first.message(yield* Wire.producerCodec.encode(event(7)))
              yield* Fiber.join(yield* received)
              first.close(4000, "lagged:7")

              const second = yield* socketAt(sockets, 1)
              second.open()
              yield* Effect.yieldNow
              expect(yield* Wire.decodeCommand(second.sent[0] as string)).toEqual({
                _tag: "Attach",
                runId: "run-1",
                cursor: 7,
              })

              yield* connection.cancel("user")
              expect(yield* Wire.decodeCommand(second.sent[1] as string)).toEqual({
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
