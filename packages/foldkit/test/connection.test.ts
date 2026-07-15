import { describe, expect, it, layer } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Layer, Option, Schema, Scope, Stream } from "effect"
import { Socket } from "effect/unstable/socket"
import { Wire } from "@batonfx/transport"
import { Chat, Connection } from "../src/index"

class FakeCloseEvent extends Event {
  readonly code: number
  readonly reason: string

  constructor(code: number, reason: string) {
    super("close")
    this.code = code
    this.reason = reason
  }
}

class FakeWebSocket extends EventTarget implements WebSocket {
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readonly extensions = ""
  readonly protocol = ""
  readonly url: string
  readonly sent: Array<unknown> = []
  binaryType: BinaryType = "blob"
  bufferedAmount = 0
  closeCalls = 0
  onclose: WebSocket["onclose"] = null
  onerror: WebSocket["onerror"] = null
  onmessage: WebSocket["onmessage"] = null
  onopen: WebSocket["onopen"] = null
  readyState: WebSocket["readyState"] = 0

  constructor(url: string) {
    super()
    this.url = url
  }

  close(code = 1000, reason = ""): void {
    this.closeCalls += 1
    if (this.readyState === this.CLOSED) return
    this.readyState = this.CLOSED
    this.dispatchEvent(new FakeCloseEvent(code, reason))
  }

  open(): void {
    this.readyState = this.OPEN
    this.dispatchEvent(new Event("open"))
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.sent.push(data)
  }
}

const provideTestLayer =
  <R, E, RIn>(testLayer: Layer.Layer<R, E, RIn>) =>
  <A, E2, R2>(effect: Effect.Effect<A, E2, R | R2>) =>
    Layer.build(testLayer).pipe(Effect.flatMap((context) => Effect.provide(effect, context)))

const webSocketLayer = (sockets: Array<FakeWebSocket>): Layer.Layer<Socket.WebSocketConstructor> =>
  Layer.succeed(Socket.WebSocketConstructor, (url) => {
    const socket = new FakeWebSocket(url)
    sockets.push(socket)
    return socket
  })

const decodeClientFrame = (value: unknown): Wire.ClientFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.ClientFrame))(value)

const openSocket = (sockets: Array<FakeWebSocket>, index: number): Effect.Effect<FakeWebSocket> =>
  Effect.suspend(function loop(): Effect.Effect<FakeWebSocket> {
    const socket = sockets[index]
    if (socket === undefined) return Effect.yieldNow.pipe(Effect.andThen(Effect.suspend(loop)))
    return Effect.sync(() => socket.open()).pipe(
      Effect.andThen(
        Effect.suspend(function attached(): Effect.Effect<FakeWebSocket> {
          return socket.sent.length === 0
            ? Effect.yieldNow.pipe(Effect.andThen(Effect.suspend(attached)))
            : Effect.succeed(socket)
        }),
      ),
    )
  })

describe("Connection", () => {
  layer(
    Connection.testLayer({
      frames: () => Stream.fromIterable([Connection.ConnectionOpened()]),
      send: () => Effect.void,
    }),
  )((methods) => {
    methods.effect("testLayer provides AgentConnection frames and send", () =>
      Effect.gen(function* () {
        const incoming = Connection.ConnectionOpened()
        const frames = yield* Connection.AgentConnection.use((connection) =>
          connection.frames({ sessionId: "s", afterSeq: 1 }).pipe(Stream.runCollect),
        )
        yield* Connection.AgentConnection.use((connection) => connection.send({ _tag: "Cancel", sessionId: "s" }))

        expect(frames).toEqual([incoming])
      }),
    )
  })

  it("keeps the chat subscription alive across afterSeq-only changes", () => {
    const subscription = Chat.subscriptions.agentFrames

    expect(subscription.keepAliveEquivalence?.({ sessionId: "s", afterSeq: 1 }, { sessionId: "s", afterSeq: 2 })).toBe(
      true,
    )
    expect(
      subscription.keepAliveEquivalence?.({ sessionId: "s-1", afterSeq: 2 }, { sessionId: "s-2", afterSeq: 2 }),
    ).toBe(false)
  })

  it.effect("routes interleaved commands through overlapping session connections and releases each scope", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.gen(function* () {
      const scopeA = yield* Scope.make()
      const scopeB = yield* Scope.make()
      const connection = yield* Connection.AgentConnection
      const framesA = yield* connection
        .frames({ sessionId: "a" })
        .pipe(Stream.runDrain, Effect.forkIn(scopeA, { startImmediately: true }))
      const socketA = yield* openSocket(sockets, 0)
      const framesB = yield* connection
        .frames({ sessionId: "b" })
        .pipe(Stream.runDrain, Effect.forkIn(scopeB, { startImmediately: true }))
      const socketB = yield* openSocket(sockets, 1)

      yield* connection.send({ _tag: "SendMessage", sessionId: "a", prompt: "first" })
      yield* connection.send({ _tag: "Cancel", sessionId: "b" })
      yield* connection.send({ _tag: "SendMessage", sessionId: "a", prompt: "second" })

      expect(socketA.sent.slice(1).map(decodeClientFrame)).toEqual([
        { _tag: "SendMessage", sessionId: "a", prompt: "first" },
        { _tag: "SendMessage", sessionId: "a", prompt: "second" },
      ])
      expect(socketB.sent.slice(1).map(decodeClientFrame)).toEqual([{ _tag: "Cancel", sessionId: "b" }])

      yield* Scope.close(scopeA, Exit.void)
      yield* Fiber.await(framesA)
      const missingA = yield* Effect.flip(connection.send({ _tag: "Cancel", sessionId: "a" }))
      expect(missingA).toBeInstanceOf(Connection.SendFailed)
      yield* connection.send({ _tag: "Cancel", sessionId: "b" })
      expect(socketA.closeCalls).toBe(1)
      expect(socketB.closeCalls).toBe(0)

      yield* Scope.close(scopeB, Exit.void)
      yield* Fiber.await(framesB)
      expect(socketB.closeCalls).toBe(1)
    }).pipe(
      provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
    )
  })

  it.effect("releases overlapping session connections in reverse order", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.gen(function* () {
      const scopeA = yield* Scope.make()
      const scopeB = yield* Scope.make()
      const connection = yield* Connection.AgentConnection
      const framesA = yield* connection
        .frames({ sessionId: "a" })
        .pipe(Stream.runDrain, Effect.forkIn(scopeA, { startImmediately: true }))
      const socketA = yield* openSocket(sockets, 0)
      const framesB = yield* connection
        .frames({ sessionId: "b" })
        .pipe(Stream.runDrain, Effect.forkIn(scopeB, { startImmediately: true }))
      const socketB = yield* openSocket(sockets, 1)

      yield* Scope.close(scopeB, Exit.void)
      yield* Fiber.await(framesB)
      const missingB = yield* Effect.flip(connection.send({ _tag: "Cancel", sessionId: "b" }))
      expect(missingB).toBeInstanceOf(Connection.SendFailed)
      yield* connection.send({ _tag: "Cancel", sessionId: "a" })
      expect(socketA.sent.slice(1).map(decodeClientFrame)).toEqual([{ _tag: "Cancel", sessionId: "a" }])
      expect(socketA.closeCalls).toBe(0)
      expect(socketB.closeCalls).toBe(1)

      yield* Scope.close(scopeA, Exit.void)
      yield* Fiber.await(framesA)
      expect(socketA.closeCalls).toBe(1)
    }).pipe(
      provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
    )
  })

  it.effect("keeps a newer same-session generation when the older scope finalizes", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.gen(function* () {
      const oldScope = yield* Scope.make()
      const newScope = yield* Scope.make()
      const connection = yield* Connection.AgentConnection
      const oldFrames = yield* connection
        .frames({ sessionId: "same" })
        .pipe(Stream.runDrain, Effect.forkIn(oldScope, { startImmediately: true }))
      const oldSocket = yield* openSocket(sockets, 0)
      const newFrames = yield* connection
        .frames({ sessionId: "same" })
        .pipe(Stream.runDrain, Effect.forkIn(newScope, { startImmediately: true }))
      const newSocket = yield* openSocket(sockets, 1)

      yield* Scope.close(oldScope, Exit.void)
      yield* Fiber.await(oldFrames)
      yield* connection.send({ _tag: "Cancel", sessionId: "same" })

      expect(oldSocket.sent.slice(1)).toEqual([])
      expect(newSocket.sent.slice(1).map(decodeClientFrame)).toEqual([{ _tag: "Cancel", sessionId: "same" }])
      expect(oldSocket.closeCalls).toBe(1)
      expect(newSocket.closeCalls).toBe(0)

      yield* Scope.close(newScope, Exit.void)
      yield* Fiber.await(newFrames)
      const missing = yield* Effect.flip(connection.send({ _tag: "Cancel", sessionId: "same" }))
      expect(missing).toBeInstanceOf(Connection.SendFailed)
      expect(newSocket.closeCalls).toBe(1)
    }).pipe(
      provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
    )
  })

  it.effect("binds direct session commands to the acquired session scope", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.gen(function* () {
      const connection = yield* Connection.AgentConnection
      const socket = yield* Effect.scoped(
        Effect.gen(function* () {
          const session = yield* connection.session({ sessionId: "owned" })
          const current = yield* openSocket(sockets, 0)
          yield* session.send({ _tag: "Cancel", sessionId: "owned" })
          const mismatched = yield* Effect.flip(session.send({ _tag: "Cancel", sessionId: "other" }))

          expect(session.sessionId).toBe("owned")
          expect(mismatched).toBeInstanceOf(Connection.SendFailed)
          expect(current.closeCalls).toBe(0)
          return current
        }),
      )

      expect(socket.sent.slice(1).map(decodeClientFrame)).toEqual([{ _tag: "Cancel", sessionId: "owned" }])
      expect(socket.closeCalls).toBe(1)
    }).pipe(
      provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
    )
  })

  it.effect("preserves a typed frame failure as a structured connection fact", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Connection.AgentConnection
        const session = yield* connection.session({ sessionId: "typed-frame-failure" })
        const failure = yield* Effect.forkScoped(
          session.frames.pipe(
            Stream.filter((incoming) => incoming._tag === "ConnectionFailed"),
            Stream.runHead,
          ),
        )
        const socket = yield* openSocket(sockets, 0)
        socket.message("not a server frame")
        const incoming = Option.getOrThrow(yield* Fiber.join(failure))

        expect(incoming).toMatchObject({
          _tag: "ConnectionFailed",
          operation: "connect",
          error: {
            _tag: "@batonfx/transport/TransportError",
            message: expect.any(String),
          },
          reason: expect.any(String),
        })
        expect(Schema.is(Connection.Incoming)(incoming)).toBe(true)
      }).pipe(
        provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
      ),
    )
  })

  it.effect("keeps frame stream defects and interruption out of connection facts", () => {
    const defect = Effect.scoped(
      Connection.AgentConnection.use((connection) =>
        connection.session({ sessionId: "defect" }).pipe(
          Effect.flatMap((session) => Stream.runDrain(session.frames)),
          Effect.exit,
        ),
      ),
    ).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.die("frame defect"),
          send: () => Effect.void,
        }),
      ),
    )
    const interruption = Effect.scoped(
      Connection.AgentConnection.use((connection) =>
        connection.session({ sessionId: "interruption" }).pipe(
          Effect.flatMap((session) => Stream.runDrain(session.frames)),
          Effect.exit,
        ),
      ),
    ).pipe(
      provideTestLayer(
        Connection.testLayer({
          frames: () => Stream.fromEffect(Effect.interrupt),
          send: () => Effect.void,
        }),
      ),
    )

    return Effect.gen(function* () {
      const defectExit = yield* defect
      const interruptExit = yield* interruption

      expect(Exit.isFailure(defectExit) && Cause.hasDies(defectExit.cause)).toBe(true)
      expect(Exit.isFailure(interruptExit) && Cause.hasInterrupts(interruptExit.cause)).toBe(true)
    })
  })

  it.effect("preserves a standard WebSocket command failure and stream interruption", () => {
    const sockets: Array<FakeWebSocket> = []
    return Effect.scoped(
      Effect.gen(function* () {
        const connection = yield* Connection.AgentConnection
        const session = yield* connection.session({ sessionId: "standard-boundary" })
        const frames = yield* Effect.forkScoped(Stream.runDrain(session.frames))
        const message = yield* Chat.CancelRun({ sessionId: "standard-boundary" }).effect
        yield* Fiber.interrupt(frames)
        const interrupted = yield* Fiber.await(frames)

        expect(message).toMatchObject({
          _tag: "FailedAgentCommand",
          operation: "cancel",
          error: {
            _tag: "@batonfx/transport/TransportError",
            message: "WebSocket is not open",
          },
          reason: "WebSocket is not open",
        })
        expect(Exit.isFailure(interrupted) && Cause.hasInterrupts(interrupted.cause)).toBe(true)
      }).pipe(
        provideTestLayer(Connection.layerWebSocket({ url: "ws://test" }).pipe(Layer.provide(webSocketLayer(sockets)))),
      ),
    )
  })
})
