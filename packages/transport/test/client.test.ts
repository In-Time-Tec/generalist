import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import * as Ai from "effect/unstable/ai"
import { Client, Wire } from "../src/index"

const endedFrame = (seq: number): Wire.LooseServerFrameType => ({ _tag: "Ended", seq })

const eventText = (frame: Wire.LooseServerFrameType): string =>
  `id: ${frame.seq}\nevent: ${frame._tag}\ndata: ${JSON.stringify(Schema.encodeUnknownSync(Wire.LooseServerFrame)(frame))}\n\n`

const httpClientLayer = (body: string): Layer.Layer<HttpClient.HttpClient> => {
  const baseRequest = HttpClientRequest.get("http://test/events")
  const response = HttpClientResponse.fromWeb(baseRequest, new Response(body, { status: 200 }))
  const client = {
    execute: () => Effect.succeed(response),
    get: () => Effect.succeed(response),
    head: () => Effect.succeed(response),
    post: () => Effect.succeed(response),
    patch: () => Effect.succeed(response),
    put: () => Effect.succeed(response),
    del: () => Effect.succeed(response),
    options: () => Effect.succeed(response),
    preprocess: (input: HttpClientRequest.HttpClientRequest) => Effect.succeed(input),
    postprocess: (input: Effect.Effect<HttpClientRequest.HttpClientRequest>) => input.pipe(Effect.as(response)),
  } as unknown as HttpClient.HttpClient
  return Layer.succeed(HttpClient.HttpClient, client)
}

class FakeWebSocket {
  readonly sent: Array<string | Uint8Array> = []
  readyState = 0
  private readonly listeners = new Map<string, Array<(event: any) => void>>()

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: any) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    )
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
  }

  close(code = 1000, reason?: string): void {
    if (this.readyState === 3) return
    this.readyState = 3
    this.emit("close", { code, reason })
  }

  open(): void {
    this.readyState = 1
    this.emit("open", {})
  }

  message(data: string | Uint8Array): void {
    this.emit("message", { data })
  }

  private emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

const webSocketLayer = (sockets: Array<FakeWebSocket>): Layer.Layer<Socket.WebSocketConstructor> =>
  Layer.succeed(Socket.WebSocketConstructor, (url) => {
    const socket = new FakeWebSocket(String(url))
    sockets.push(socket)
    return socket as unknown as WebSocket
  })

const decodeClientFrame = (text: string): Wire.ClientFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.ClientFrame))(text)

const encodeServerFrame = (frame: Wire.LooseServerFrameType): string =>
  JSON.stringify(Schema.encodeUnknownSync(Wire.LooseServerFrame)(frame))

describe("Client", () => {
  it.effect("sseFrames decodes text/event-stream with loose server frames", () =>
    Effect.gen(function* () {
      const frames = yield* Client.sseFrames({ url: "http://test/events" }).pipe(Stream.runCollect)

      expect(frames.map((frame) => frame.seq)).toEqual([0, 1])
      expect(frames[0]?._tag).toBe("Event")
      if (frames[0]?._tag === "Event") {
        expect(frames[0].event._tag).toBe("ModelPart")
      }
    }).pipe(
      Effect.provide(
        httpClientLayer(
          eventText({
            _tag: "Event",
            seq: 0,
            event: {
              _tag: "ModelPart",
              turn: 0,
              part: Ai.Response.makePart("tool-call", {
                id: "unknown",
                name: "missing",
                params: { x: 1 },
                providerExecuted: false,
              }),
            },
          }) + eventText(endedFrame(1)),
        ),
      ),
    ),
  )

  it.effect("WebSocket client sends Attach on open", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        yield* Client.AgentClient.use((client) => client.connect({ url: "ws://test", sessionId: "s-client" }))
        yield* Effect.yieldNow
        const socket = sockets[0]
        expect(socket).toBeDefined()
        socket?.open()
        yield* Effect.yieldNow

        expect(socket?.sent.length).toBe(1)
        expect(typeof socket?.sent[0] === "string" && decodeClientFrame(socket.sent[0])._tag).toBe("Attach")
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client reconnects with the last seen seq", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const framesFiber = yield* connection.frames.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        yield* Effect.yieldNow
        const first = sockets[0]
        first?.open()
        yield* Effect.yieldNow
        first?.message(encodeServerFrame(endedFrame(7)))
        yield* Fiber.join(framesFiber)
        first?.close(4000, "lagged")
        yield* Effect.yieldNow
        yield* TestClock.adjust("100 millis")
        const second = sockets[1]
        second?.open()
        yield* Effect.yieldNow

        expect(second).toBeDefined()
        expect(typeof second?.sent[0] === "string" && decodeClientFrame(second.sent[0])).toEqual({
          _tag: "Attach",
          sessionId: "s-client",
          afterSeq: 7,
        })
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client backs off repeated reconnect attempts", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        yield* Client.AgentClient.use((client) => client.connect({ url: "ws://test", sessionId: "s-client" }))
        yield* Effect.yieldNow
        const first = sockets[0]
        expect(first).toBeDefined()
        first?.close(4000, "failed")
        yield* Effect.yieldNow

        yield* TestClock.adjust("99 millis")
        expect(sockets.length).toBe(1)
        yield* TestClock.adjust("1 millis")
        yield* Effect.yieldNow
        const second = sockets[1]
        expect(second).toBeDefined()
        second?.close(4000, "failed")
        yield* Effect.yieldNow

        yield* TestClock.adjust("199 millis")
        expect(sockets.length).toBe(2)
        yield* TestClock.adjust("1 millis")
        yield* Effect.yieldNow

        expect(sockets[2]).toBeDefined()
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client fails the frame stream on malformed server frames", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const failureFiber = yield* connection.frames.pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
        yield* Effect.yieldNow
        const socket = sockets[0]
        expect(socket).toBeDefined()
        socket?.open()
        yield* Effect.yieldNow
        socket?.message("not-json")

        const failure = yield* Fiber.join(failureFiber)
        yield* TestClock.adjust("100 millis")
        yield* Effect.yieldNow

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
        expect(sockets.length).toBe(1)
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client fails the frame stream on binary server frames", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const failureFiber = yield* connection.frames.pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
        yield* Effect.yieldNow
        const socket = sockets[0]
        expect(socket).toBeDefined()
        socket?.open()
        yield* Effect.yieldNow
        socket?.message(new TextEncoder().encode(encodeServerFrame(endedFrame(8))))

        const failure = yield* Fiber.join(failureFiber)
        yield* TestClock.adjust("100 millis")
        yield* Effect.yieldNow

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
        expect(sockets.length).toBe(1)
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("send fails while disconnected", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const failure = yield* Effect.flip(connection.send({ _tag: "Cancel", sessionId: "s-client" }))

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
      }),
    ).pipe(Effect.provide(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })
})
