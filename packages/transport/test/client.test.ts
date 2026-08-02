import { describe, expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Layer, Schedule, Schema, Scope, Stream } from "effect"
import { TestClock } from "effect/testing"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Prompt } from "effect/unstable/ai"
import { Client, Wire } from "../src/index"

const provideTestLayer =
  <R, E, RIn>(layer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(layer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

const endedFrame = (seq: number): Wire.LooseServerFrameType => ({ _tag: "Ended", seq })

const dynamicToolFrames: ReadonlyArray<Wire.LooseServerFrameType> = [
  {
    _tag: "Event",
    seq: 0,
    event: {
      _tag: "ToolExecutionStarted",
      turn: 0,
      call: { type: "tool-call", id: "activate-1", name: "activate_skill", params: { name: "review" } },
    },
  },
  {
    _tag: "Event",
    seq: 1,
    event: {
      _tag: "ToolExecutionCompleted",
      turn: 0,
      call: { type: "tool-call", id: "activate-1", name: "activate_skill", params: { name: "review" } },
      result: {
        type: "tool-result",
        id: "activate-1",
        name: "activate_skill",
        result: { activated: "review" },
        isFailure: false,
      },
    },
  },
  {
    _tag: "Event",
    seq: 2,
    event: {
      _tag: "ToolExecutionStarted",
      turn: 1,
      call: { type: "tool-call", id: "review-1", name: "review_tool", params: { path: "src" } },
    },
  },
  {
    _tag: "Event",
    seq: 3,
    event: { _tag: "ToolProgress", turn: 1, toolCallId: "review-1", message: "reviewing" },
  },
  {
    _tag: "Event",
    seq: 4,
    event: {
      _tag: "ToolExecutionCompleted",
      turn: 1,
      call: { type: "tool-call", id: "review-1", name: "review_tool", params: { path: "src" } },
      result: {
        type: "tool-result",
        id: "review-1",
        name: "review_tool",
        result: { issues: 0 },
        isFailure: false,
      },
    },
  },
]

const eventText = (frame: Wire.LooseServerFrameType, id: string | number = frame.seq): string =>
  `id: ${id}\nevent: ${frame._tag}\ndata: ${Schema.encodeUnknownSync(Schema.fromJsonString(Wire.LooseServerFrame))(frame)}\n\n`

const invalidSequenceEventText = (seq: number): string =>
  `id: ${seq}\nevent: Ended\ndata: ${JSON.stringify({ _tag: "Ended", seq })}\n\n`

const httpClientLayer = (body: string): Layer.Layer<HttpClient.HttpClient> => {
  const baseRequest = HttpClientRequest.get("http://test/events")
  const response = HttpClientResponse.fromWeb(baseRequest, new globalThis.Response(body, { status: 200 }))
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
  binaryType: BinaryType = "blob"
  throwOnSend = false
  private readonly listeners = new Map<string, Array<(event: unknown) => void>>()

  constructor(readonly url: string) {}

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((candidate) => candidate !== listener),
    )
  }

  send(data: string | Uint8Array): void {
    this.sent.push(data)
    if (this.throwOnSend) throw new Error("writer failed")
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

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }
}

const webSocketLayer = (sockets: Array<FakeWebSocket>): Layer.Layer<Socket.WebSocketConstructor> =>
  Layer.succeed(Socket.WebSocketConstructor, (url) => {
    const socket = new FakeWebSocket(String(url))
    sockets.push(socket)
    return socket as unknown as WebSocket
  })

const socketAt = (sockets: ReadonlyArray<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(() => {
    const socket = sockets[index]
    return socket === undefined
      ? Effect.yieldNow.pipe(Effect.andThen(socketAt(sockets, index)))
      : Effect.succeed(socket)
  })

const sentAt = (socket: FakeWebSocket, index: number): Effect.Effect<string | Uint8Array> =>
  Effect.suspend(() => {
    const sent = socket.sent[index]
    return sent === undefined ? Effect.yieldNow.pipe(Effect.andThen(sentAt(socket, index))) : Effect.succeed(sent)
  })

const decodeClientFrame = (text: string): Wire.ClientFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.ClientFrame))(text)

const encodeServerFrame = (frame: Wire.LooseServerFrameType): string =>
  Schema.encodeUnknownSync(Schema.fromJsonString(Wire.LooseServerFrame))(frame)

describe("Client", () => {
  const invalidSequences = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1]

  it.effect("SSE client rejects invalid payload sequences", () =>
    Effect.gen(function* () {
      for (const seq of invalidSequences) {
        const error = yield* Client.sseFrames({ url: "http://test/events" }).pipe(
          Stream.runDrain,
          Effect.flip,
          provideTestLayer(httpClientLayer(invalidSequenceEventText(seq))),
        )
        expect(error._tag).toBe("@batonfx/transport/TransportError")
      }
    }),
  )

  it.effect("SSE client rejects an event ID that differs from the payload sequence", () =>
    Client.sseFrames({ url: "http://test/events" }).pipe(
      Stream.runDrain,
      Effect.flip,
      Effect.map((error) => expect(error._tag).toBe("@batonfx/transport/TransportError")),
      provideTestLayer(httpClientLayer(eventText(endedFrame(1), 2))),
    ),
  )

  it.effect("SSE client rejects invalid event IDs", () =>
    Effect.gen(function* () {
      const invalidIds = ["", " ", "+1", "1e2", "0x10", "-1", "1.5", "Infinity", "NaN", "9007199254740992"]
      for (const id of invalidIds) {
        const error = yield* Client.sseFrames({ url: "http://test/events" }).pipe(
          Stream.runDrain,
          Effect.flip,
          provideTestLayer(httpClientLayer(eventText(endedFrame(0), id))),
        )
        expect(error._tag).toBe("@batonfx/transport/TransportError")
      }
    }),
  )

  it.effect("sseFrames decodes text/event-stream with loose server frames", () =>
    Effect.gen(function* () {
      const frames = yield* Client.sseFrames({ url: "http://test/events" }).pipe(Stream.runCollect)

      expect(frames).toEqual(dynamicToolFrames)
    }).pipe(provideTestLayer(httpClientLayer(dynamicToolFrames.map((frame) => eventText(frame)).join("")))),
  )

  it.effect("WebSocket client sends Attach on open", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        yield* Client.AgentClient.use((client) => client.connect({ url: "ws://test", sessionId: "s-client" }))
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)

        expect(socket?.sent.length).toBe(1)
        expect(socket.binaryType).toBe("arraybuffer")
        expect(typeof socket?.sent[0] === "string" && decodeClientFrame(socket.sent[0])._tag).toBe("Attach")
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client decodes runtime-dynamic tool events with the loose schema", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-dynamic-client" }),
        )
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        for (const frame of dynamicToolFrames) socket.message(encodeServerFrame(frame))

        const frames = yield* connection.frames.pipe(Stream.take(dynamicToolFrames.length), Stream.runCollect)

        expect(frames).toEqual(dynamicToolFrames)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("validates client buffer capacities", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const exit = yield* Effect.exit(
          Client.AgentClient.use((client) =>
            client.connect({
              url: "ws://test",
              sessionId: "s-client",
              buffering: {
                frameCapacity: 0,
                frameStrategy: "backpressure",
                statusCapacity: 1,
                statusStrategy: "sliding",
              },
            }),
          ),
        )

        expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
        if (Exit.isFailure(exit)) {
          expect(exit.cause.reasons.find(Cause.isDieReason)?.defect).toBeInstanceOf(TypeError)
        }
        expect(sockets).toHaveLength(0)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect.each([
    ["dropping", [0, 1]],
    ["sliding", [1, 2]],
  ] as const)("applies the %s frame overflow strategy", ([frameStrategy, expected]) => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            buffering: {
              frameCapacity: 2,
              frameStrategy,
              statusCapacity: 8,
              statusStrategy: "sliding",
            },
          }),
        )
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        socket.message(encodeServerFrame(endedFrame(0)))
        socket.message(encodeServerFrame(endedFrame(1)))
        socket.message(encodeServerFrame(endedFrame(2)))

        const frames = yield* connection.frames.pipe(Stream.take(2), Stream.runCollect)

        expect(frames.map((frame) => frame.seq)).toEqual(expected)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("backpressures frame delivery without losing order", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            buffering: {
              frameCapacity: 1,
              frameStrategy: "backpressure",
              statusCapacity: 8,
              statusStrategy: "sliding",
            },
          }),
        )
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        socket.message(encodeServerFrame(endedFrame(0)))
        yield* Effect.yieldNow
        socket.message(encodeServerFrame(endedFrame(1)))
        yield* Effect.yieldNow

        const frames = yield* connection.frames.pipe(Stream.take(2), Stream.runCollect)

        expect(frames.map((frame) => frame.seq)).toEqual([0, 1])
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("reconnects from the last published frame when backpressure ingress overflows", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            buffering: {
              frameCapacity: 1,
              frameStrategy: "backpressure",
              statusCapacity: 8,
              statusStrategy: "sliding",
            },
            reconnect: {
              schedule: Schedule.recurs(1),
              retryable: () => true,
            },
          }),
        )
        const first = yield* socketAt(sockets, 0)
        first.open()
        yield* sentAt(first, 0)
        first.message(encodeServerFrame(endedFrame(0)))
        yield* Effect.yieldNow
        first.message(encodeServerFrame(endedFrame(1)))
        first.message(encodeServerFrame(endedFrame(2)))

        const second = yield* socketAt(sockets, 1)
        second.open()
        const attach = yield* sentAt(second, 0)

        expect(typeof attach === "string" && decodeClientFrame(attach)).toEqual({
          _tag: "Attach",
          sessionId: "s-client",
          afterSeq: 0,
        })
        expect(connection).toBeDefined()
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("does not advance the reconnect cursor past a dropped consumer frame", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            buffering: {
              frameCapacity: 1,
              frameStrategy: "dropping",
              statusCapacity: 8,
              statusStrategy: "sliding",
            },
            reconnect: {
              schedule: Schedule.recurs(1),
              retryable: () => true,
            },
          }),
        )
        const first = yield* socketAt(sockets, 0)
        first.open()
        yield* sentAt(first, 0)
        first.message(encodeServerFrame(endedFrame(0)))
        yield* Effect.yieldNow
        first.message(encodeServerFrame(endedFrame(1)))
        yield* Effect.yieldNow
        first.close(4000, "reconnect")

        const second = yield* socketAt(sockets, 1)
        second.open()
        const attach = yield* sentAt(second, 0)

        expect(typeof attach === "string" && decodeClientFrame(attach)).toEqual({
          _tag: "Attach",
          sessionId: "s-client",
          afterSeq: 0,
        })
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect.each([
    ["dropping", ["Connecting", "Connected"]],
    ["sliding", ["Disconnected", "Retrying"]],
  ] as const)("applies the %s status overflow strategy", ([statusStrategy, expected]) => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            buffering: {
              frameCapacity: 8,
              frameStrategy: "backpressure",
              statusCapacity: 2,
              statusStrategy,
            },
            reconnect: {
              schedule: Schedule.recurs(1),
              retryable: () => true,
            },
          }),
        )
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        socket.close(4000, "retry")
        yield* Effect.yieldNow

        const statuses = yield* connection.status.pipe(Stream.take(2), Stream.runCollect)

        expect(statuses.map((status) => status._tag)).toEqual(expected)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client reconnects with the last seen seq", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const framesFiber = yield* connection.frames.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        const first = yield* socketAt(sockets, 0)
        first.open()
        yield* sentAt(first, 0)
        first.message(encodeServerFrame(endedFrame(7)))
        yield* Fiber.join(framesFiber)
        first.close(4000, "lagged")
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
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client omits the reconnect cursor after a pre-history snapshot", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const framesFiber = yield* connection.frames.pipe(Stream.take(1), Stream.runCollect, Effect.forkChild)
        const first = yield* socketAt(sockets, 0)
        first.open()
        yield* sentAt(first, 0)
        first.message(encodeServerFrame({ _tag: "Snapshot", seq: -1, transcript: Prompt.empty }))
        yield* Fiber.join(framesFiber)
        first.close(4000, "lagged")
        yield* Effect.yieldNow
        yield* TestClock.adjust("100 millis")
        const second = yield* socketAt(sockets, 1)
        second.open()
        const attach = yield* sentAt(second, 0)

        expect(typeof attach === "string" && decodeClientFrame(attach)).toEqual({
          _tag: "Attach",
          sessionId: "s-client",
        })
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("does not retry a failure rejected by the reconnect classifier", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            reconnect: {
              schedule: Schedule.recurs(5),
              retryable: () => false,
            },
          }),
        )
        const failureFiber = yield* connection.frames.pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
        const socket = yield* socketAt(sockets, 0)
        socket.close(4000, "terminal")

        const failure = yield* Fiber.join(failureFiber)
        yield* Effect.yieldNow

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
        expect(sockets).toHaveLength(1)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("reports finite reconnect exhaustion with the last typed failure", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            reconnect: {
              schedule: Schedule.recurs(1),
              retryable: () => true,
            },
          }),
        )
        const exhaustionFiber = yield* connection.exhausted.pipe(Effect.flip, Effect.forkChild)
        const first = yield* socketAt(sockets, 0)
        first.close(4000, "first")
        const second = yield* socketAt(sockets, 1)
        second.close(4000, "last")

        const exhaustion = yield* Fiber.join(exhaustionFiber)

        expect(exhaustion._tag).toBe("@batonfx/transport/ReconnectExhausted")
        expect(exhaustion.lastError._tag).toBe("@batonfx/transport/TransportError")
        expect(exhaustion.lastError.message).toContain("last")
        expect(sockets).toHaveLength(2)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("keeps synchronous Attach writer failures typed", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({
            url: "ws://test",
            sessionId: "s-client",
            reconnect: {
              schedule: Schedule.recurs(0),
              retryable: () => true,
            },
          }),
        )
        const exhaustionFiber = yield* connection.exhausted.pipe(Effect.flip, Effect.forkChild)
        const socket = yield* socketAt(sockets, 0)
        socket.throwOnSend = true
        socket.open()

        const exhaustion = yield* Fiber.join(exhaustionFiber)

        expect(exhaustion.lastError.kind).toBe("socket")
        expect(exhaustion.lastError.message).toContain("writer failed")
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("interrupts a pending reconnect when the connection scope closes", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.gen(function* () {
      const scope = yield* Scope.make()
      yield* Client.AgentClient.use((client) =>
        client.connect({
          url: "ws://test",
          sessionId: "s-client",
          reconnect: {
            schedule: Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 2 })),
            retryable: () => true,
          },
        }),
      ).pipe(Scope.provide(scope))
      const socket = yield* socketAt(sockets, 0)
      socket.close(4000, "retry")
      yield* Effect.yieldNow
      yield* Scope.close(scope, Exit.void)
      yield* TestClock.adjust("3 seconds")
      yield* Effect.yieldNow

      expect(sockets).toHaveLength(1)
      expect(sockets[0]?.readyState).toBe(3)
    }).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client backs off repeated reconnect attempts", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        yield* Client.AgentClient.use((client) => client.connect({ url: "ws://test", sessionId: "s-client" }))
        const first = yield* socketAt(sockets, 0)
        first.close(4000, "failed")
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
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client fails the frame stream on malformed server frames", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const failureFiber = yield* connection.frames.pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        socket.message("not-json")

        const failure = yield* Fiber.join(failureFiber)
        yield* TestClock.adjust("100 millis")
        yield* Effect.yieldNow

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
        expect(sockets.length).toBe(1)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })

  it.effect("WebSocket client fails the frame stream on binary server frames", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Client.AgentClient.use((client) =>
          client.connect({ url: "ws://test", sessionId: "s-client" }),
        )
        const failureFiber = yield* connection.frames.pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
        const socket = yield* socketAt(sockets, 0)
        socket.open()
        yield* sentAt(socket, 0)
        socket.message(new TextEncoder().encode(encodeServerFrame(endedFrame(8))))

        const failure = yield* Fiber.join(failureFiber)
        yield* TestClock.adjust("100 millis")
        yield* Effect.yieldNow

        expect(failure._tag).toBe("@batonfx/transport/TransportError")
        expect(sockets.length).toBe(1)
      }),
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
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
    ).pipe(provideTestLayer(Client.layerWebSocket.pipe(Layer.provide(webSocketLayer(sockets)))))
  })
})
