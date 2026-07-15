import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Queue, Ref, Schema, Stream } from "effect"
import { Headers, HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Prompt, Toolkit } from "effect/unstable/ai"
import { SessionRegistry, Wire, Ws } from "../src/index"

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

const dynamicFrames: ReadonlyArray<Wire.LooseServerFrameType> = [
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
    event: { _tag: "ToolProgress", turn: 1, toolCallId: "review-1", message: "reviewing", data: { pct: 50 } },
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

interface FakeSocket {
  readonly socket: Socket.Socket
  readonly inbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
  readonly outbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
}

interface FakeSocketOptions {
  readonly concurrentHandlers?: boolean
  readonly beforeHandle?: (message: string | Uint8Array) => Effect.Effect<void>
  readonly afterHandle?: (message: string | Uint8Array) => Effect.Effect<void>
}

const makeFakeSocket = (fakeOptions: FakeSocketOptions = {}): Effect.Effect<FakeSocket> =>
  Effect.gen(function* () {
    const inbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    const outbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    const socket = Socket.make({
      runRaw: (handler, options) =>
        Effect.gen(function* () {
          if (options?.onOpen !== undefined) yield* options.onOpen
          let open = true
          while (open) {
            const message = yield* Queue.take(inbound)
            if (Socket.isCloseEvent(message)) {
              open = false
            } else {
              const before = fakeOptions.beforeHandle === undefined ? Effect.void : fakeOptions.beforeHandle(message)
              const handleEffect = Effect.suspend(() => {
                const result = handler(message)
                return Effect.isEffect(result) ? result : Effect.void
              })
              const afterHandle = fakeOptions.afterHandle
              const handle = before.pipe(
                Effect.andThen(handleEffect),
                afterHandle === undefined ? (effect) => effect : Effect.tap(() => afterHandle(message)),
              )
              if (fakeOptions.concurrentHandlers === true) yield* handle.pipe(Effect.forkChild)
              else yield* handle
            }
          }
        }),
      writer: Effect.succeed((chunk) => Queue.offer(outbound, chunk).pipe(Effect.asVoid)),
    })
    return { socket, inbound, outbound }
  })

const request = (socket: Socket.Socket): HttpServerRequest.HttpServerRequest =>
  ({
    url: "http://test/ws",
    originalUrl: "http://test/ws",
    headers: Headers.empty,
    upgrade: Effect.succeed(socket),
  }) as unknown as HttpServerRequest.HttpServerRequest

const clientFrameText = (frame: Wire.ClientFrameType): string =>
  Schema.encodeUnknownSync(Schema.fromJsonString(Wire.ClientFrame))(frame)

const decodeClientFrameText = (text: string): Wire.ClientFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.ClientFrame))(text)

const decodeServerFrame = (text: string): Wire.LooseServerFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.LooseServerFrame))(text)

const commandFrames = (
  sessionId: string,
): ReadonlyArray<Exclude<Wire.ClientFrameType, { readonly _tag: "Attach" }>> => [
  { _tag: "SendMessage", sessionId, prompt: "hello" },
  { _tag: "ResolveApproval", sessionId, token: "t", decision: { _tag: "Approved" } },
  { _tag: "Cancel", sessionId },
]

const registryLayer = (
  implementation: Partial<SessionRegistry.Interface>,
): Layer.Layer<SessionRegistry.SessionRegistry> =>
  Layer.succeed(
    SessionRegistry.SessionRegistry,
    SessionRegistry.SessionRegistry.of({
      open: () => Effect.fail(SessionRegistry.SessionError.make({ message: "unused" })),
      send: implementation.send ?? (() => Effect.void),
      resolveApproval: implementation.resolveApproval ?? (() => Effect.void),
      attach: implementation.attach ?? (() => Stream.never),
      interrupt: implementation.interrupt ?? (() => Effect.void),
      info: () => Effect.fail(SessionRegistry.SessionError.make({ message: "unused" })),
    }),
  )

const runHandler = (fake: FakeSocket, layer: Layer.Layer<SessionRegistry.SessionRegistry>) =>
  Ws.handle(toolkit).pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, request(fake.socket)),
    provideTestLayer(layer),
    Effect.scoped,
    Effect.forkChild,
  )

const runDynamicHandler = (fake: FakeSocket, layer: Layer.Layer<SessionRegistry.SessionRegistry>) =>
  Ws.handle({ capability: "runtime-dynamic" }).pipe(
    Effect.provideService(HttpServerRequest.HttpServerRequest, request(fake.socket)),
    provideTestLayer(layer),
    Effect.scoped,
    Effect.forkChild,
  )

describe("Ws", () => {
  const invalidSequences = [-1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1]

  it.effect("rejects Attach frames with invalid sequences", () =>
    Effect.gen(function* () {
      for (const afterSeq of invalidSequences) {
        const fake = yield* makeFakeSocket()
        const fiber = yield* runHandler(fake, registryLayer({}))
        const text = `{"_tag":"Attach","sessionId":"s-ws","afterSeq":${String(afterSeq)}}`

        yield* Queue.offer(fake.inbound, text)
        const output = yield* Queue.take(fake.outbound)
        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)

        expect(Socket.isCloseEvent(output)).toBe(true)
        expect(Socket.isCloseEvent(output) && output.code).toBe(1003)
      }
    }),
  )

  it.effect("Attach streams server frames as JSON text", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(
        fake,
        registryLayer({ attach: () => Stream.fromIterable([eventFrame, endedFrame]) }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-ws" }))
      const first = yield* Queue.take(fake.outbound)
      const second = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(typeof first).toBe("string")
      expect(typeof second).toBe("string")
      expect(typeof first === "string" && decodeServerFrame(first)._tag).toBe("Event")
      expect(typeof second === "string" && decodeServerFrame(second)._tag).toBe("Ended")
    }),
  )

  it.effect("runtime-dynamic WebSocket streams and replays activated tool events", () =>
    Effect.gen(function* () {
      const cursors = yield* Ref.make<Array<number | undefined>>([])
      const attach = (_sessionId: string, afterSeq?: number) =>
        Ref.update(cursors, (values) => [...values, afterSeq]).pipe(
          Effect.map(() => dynamicFrames.filter((frame) => frame.seq > (afterSeq ?? -1))),
          Stream.fromEffect,
          Stream.flatMap(Stream.fromIterable),
        )

      const first = yield* makeFakeSocket()
      const firstFiber = yield* runDynamicHandler(first, registryLayer({ attach }))
      yield* Queue.offer(first.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-dynamic" }))
      const firstFrames: Array<Wire.LooseServerFrameType> = []
      for (let index = 0; index < dynamicFrames.length; index++) {
        const output = yield* Queue.take(first.outbound)
        if (typeof output === "string") firstFrames.push(decodeServerFrame(output))
      }
      yield* Queue.offer(first.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(firstFiber)

      const replay = yield* makeFakeSocket()
      const replayFiber = yield* runDynamicHandler(replay, registryLayer({ attach }))
      yield* Queue.offer(replay.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-dynamic", afterSeq: 1 }))
      const replayFrames: Array<Wire.LooseServerFrameType> = []
      for (let index = 2; index < dynamicFrames.length; index++) {
        const output = yield* Queue.take(replay.outbound)
        if (typeof output === "string") replayFrames.push(decodeServerFrame(output))
      }
      yield* Queue.offer(replay.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(replayFiber)

      expect(firstFrames).toEqual(dynamicFrames)
      expect(replayFrames).toEqual(dynamicFrames.slice(2))
      expect(yield* Ref.get(cursors)).toEqual([undefined, 1])
    }),
  )

  it.effect("Attach streams a pre-history snapshot sentinel", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(
        fake,
        registryLayer({ attach: () => Stream.succeed({ _tag: "Snapshot", seq: -1, transcript: Prompt.empty }) }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-snapshot" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(typeof output === "string" && decodeServerFrame(output)).toEqual({
        _tag: "Snapshot",
        seq: -1,
        transcript: Prompt.empty,
      })
    }),
  )

  it.effect("server frame encoding failures close the socket without defects", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(fake, registryLayer({ attach: () => Stream.succeed({ _tag: "Ended", seq: -1 }) }))

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-invalid-frame" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1011)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("wire encoding failed")
    }),
  )

  it.effect("runtime-dynamic encoding failures close the socket without replay failures", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runDynamicHandler(
        fake,
        registryLayer({
          attach: () =>
            Stream.succeed({
              _tag: "Event",
              seq: 0,
              event: {
                _tag: "ToolExecutionStarted",
                turn: 0,
                call: { type: "tool-call", id: "runtime-1", name: "runtime", params: 1n },
              },
            }),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s-invalid-dynamic" }))
      const output = yield* Queue.take(fake.outbound)
      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1011)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("wire encoding failed")
      expect(Option.isNone(yield* Queue.poll(fake.outbound))).toBe(true)

      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)
    }),
  )

  it.effect("dispatches every command only after attaching to the same session", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const calls = yield* Ref.make<Array<string>>([])
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId, prompt) => Ref.update(calls, (items) => [...items, `send:${sessionId}:${prompt}`]),
          resolveApproval: (sessionId, token, decision) =>
            Ref.update(calls, (items) => [...items, `approval:${sessionId}:${token}:${decision._tag}`]),
          interrupt: (sessionId) => Ref.update(calls, (items) => [...items, `cancel:${sessionId}`]),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "SendMessage", sessionId: "s", prompt: "hello" }))
      yield* Queue.offer(
        fake.inbound,
        clientFrameText({ _tag: "ResolveApproval", sessionId: "s", token: "t", decision: { _tag: "Approved" } }),
      )
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Cancel", sessionId: "s" }))
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)
      const recorded = yield* Ref.get(calls)

      expect(recorded).toEqual(["send:s:hello", "approval:s:t:Approved", "cancel:s"])
    }),
  )

  it.effect("rejects every command before attach without dispatching", () =>
    Effect.gen(function* () {
      for (const frame of commandFrames("s")) {
        const fake = yield* makeFakeSocket()
        const calls = yield* Ref.make<Array<string>>([])
        const fiber = yield* runHandler(
          fake,
          registryLayer({
            send: (sessionId) => Ref.update(calls, (items) => [...items, `send:${sessionId}`]),
            resolveApproval: (sessionId) => Ref.update(calls, (items) => [...items, `approval:${sessionId}`]),
            interrupt: (sessionId) => Ref.update(calls, (items) => [...items, `cancel:${sessionId}`]),
          }),
        )

        yield* Queue.offer(fake.inbound, clientFrameText(frame))
        const output = yield* Queue.take(fake.outbound)
        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)

        expect(Socket.isCloseEvent(output)).toBe(true)
        expect(Socket.isCloseEvent(output) && output.code).toBe(1008)
        expect(Socket.isCloseEvent(output) && output.reason).toBe("not attached")
        expect(yield* Ref.get(calls)).toEqual([])
      }
    }),
  )

  it.effect("rejects every cross-session command without dispatching", () =>
    Effect.gen(function* () {
      for (const frame of commandFrames("other")) {
        const fake = yield* makeFakeSocket()
        const calls = yield* Ref.make<Array<string>>([])
        const fiber = yield* runHandler(
          fake,
          registryLayer({
            send: (sessionId) => Ref.update(calls, (items) => [...items, `send:${sessionId}`]),
            resolveApproval: (sessionId) => Ref.update(calls, (items) => [...items, `approval:${sessionId}`]),
            interrupt: (sessionId) => Ref.update(calls, (items) => [...items, `cancel:${sessionId}`]),
          }),
        )

        yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "attached" }))
        yield* Queue.offer(fake.inbound, clientFrameText(frame))
        const output = yield* Queue.take(fake.outbound)
        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)

        expect(Socket.isCloseEvent(output)).toBe(true)
        expect(Socket.isCloseEvent(output) && output.code).toBe(1008)
        expect(Socket.isCloseEvent(output) && output.reason).toBe("session mismatch")
        expect(yield* Ref.get(calls)).toEqual([])
      }
    }),
  )

  it.effect("rejects a command that wins an Attach race before attachment", () =>
    Effect.gen(function* () {
      const releaseAttach = yield* Deferred.make<void>()
      const attachHandled = yield* Deferred.make<void>()
      const attachStarts = yield* Ref.make(0)
      const fake = yield* makeFakeSocket({
        concurrentHandlers: true,
        beforeHandle: (message) =>
          typeof message === "string" && decodeClientFrameText(message)._tag === "Attach"
            ? Deferred.await(releaseAttach)
            : Effect.void,
        afterHandle: (message) =>
          typeof message === "string" && decodeClientFrameText(message)._tag === "Attach"
            ? Deferred.succeed(attachHandled, undefined).pipe(Effect.asVoid)
            : Effect.void,
      })
      const calls = yield* Ref.make<Array<string>>([])
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId) => Ref.update(calls, (items) => [...items, sessionId]),
          attach: () =>
            Stream.fromEffect(Ref.update(attachStarts, (count) => count + 1)).pipe(
              Stream.drain,
              Stream.concat(Stream.never),
            ),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "attached" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "SendMessage", sessionId: "attached", prompt: "hello" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Deferred.succeed(releaseAttach, undefined)
      yield* Deferred.await(attachHandled)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1008)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("not attached")
      expect(yield* Ref.get(calls)).toEqual([])
      expect(yield* Ref.get(attachStarts)).toBe(0)
    }),
  )

  it.effect("dispatches a matching command that loses an Attach race", () =>
    Effect.gen(function* () {
      const releaseCommand = yield* Deferred.make<void>()
      const attachHandled = yield* Deferred.make<void>()
      const dispatched = yield* Deferred.make<string>()
      const fake = yield* makeFakeSocket({
        concurrentHandlers: true,
        beforeHandle: (message) =>
          typeof message === "string" && decodeClientFrameText(message)._tag === "SendMessage"
            ? Deferred.await(releaseCommand)
            : Effect.void,
        afterHandle: (message) =>
          typeof message === "string" && decodeClientFrameText(message)._tag === "Attach"
            ? Deferred.succeed(attachHandled, undefined).pipe(Effect.asVoid)
            : Effect.void,
      })
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId) => Deferred.succeed(dispatched, sessionId).pipe(Effect.asVoid),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "attached" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "SendMessage", sessionId: "attached", prompt: "hello" }))
      yield* Deferred.await(attachHandled)
      yield* Deferred.succeed(releaseCommand, undefined)

      expect(yield* Deferred.await(dispatched)).toBe("attached")

      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)
    }),
  )

  it.effect("makes policy close terminal before queued handlers dispatch", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const calls = yield* Ref.make<Array<string>>([])
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId) => Ref.update(calls, (items) => [...items, sessionId]),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "attached" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "SendMessage", sessionId: "other", prompt: "bad" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(
        fake.inbound,
        clientFrameText({ _tag: "SendMessage", sessionId: "attached", prompt: "after-close" }),
      )
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output) && output.code).toBe(1008)
      expect(yield* Ref.get(calls)).toEqual([])
    }),
  )

  it.effect("treats repeated same-session Attach as idempotent", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const attached = yield* Ref.make<Array<string>>([])
      const started = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          attach: (sessionId) =>
            Stream.fromEffect(
              Ref.update(attached, (items) => [...items, sessionId]).pipe(
                Effect.andThen(Deferred.succeed(started, undefined)),
              ),
            ).pipe(
              Stream.drain,
              Stream.concat(Stream.never),
              Stream.ensuring(Deferred.succeed(interrupted, undefined).pipe(Effect.asVoid)),
            ),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "same" }))
      yield* Deferred.await(started)
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "same", afterSeq: 10 }))
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(yield* Ref.get(attached)).toEqual(["same"])
      expect(yield* Deferred.isDone(interrupted)).toBe(true)
    }),
  )

  it.effect("rejects Attach for a different session and keeps the original attachment", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const firstInterrupted = yield* Deferred.make<void>()
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          attach: () =>
            Stream.never.pipe(Stream.ensuring(Deferred.succeed(firstInterrupted, undefined).pipe(Effect.asVoid))),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "first" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "second" }))
      const output = yield* Queue.take(fake.outbound)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1008)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("session mismatch")
      expect(yield* Deferred.isDone(firstInterrupted)).toBe(false)

      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)
      expect(yield* Deferred.isDone(firstInterrupted)).toBe(true)
    }),
  )

  it.effect("SubscriberLagged closes the socket with code 4000", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          attach: () => Stream.fail(SessionRegistry.SubscriberLagged.make({ sessionId: "s", lastDeliveredSeq: 0 })),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(4000)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("lagged")
    }),
  )

  it.effect("malformed client frames close without emitting replay Failed frames", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(fake, registryLayer({}))

      yield* Queue.offer(fake.inbound, "not-json")
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1003)
    }),
  )

  it.effect("SessionQueueFull closes the socket with a retry-later code", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId) => Effect.fail(SessionRegistry.SessionQueueFull.make({ sessionId, capacity: 1 })),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "s" }))
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "SendMessage", sessionId: "s", prompt: "hello" }))
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1013)
      expect(Socket.isCloseEvent(output) && output.reason).toBe("session queue full")
    }),
  )

  it.effect("binary client frames close without dispatching", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const calls = yield* Ref.make<Array<string>>([])
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          send: (sessionId, prompt) => Ref.update(calls, (items) => [...items, `send:${sessionId}:${prompt}`]),
        }),
      )

      yield* Queue.offer(
        fake.inbound,
        new TextEncoder().encode(clientFrameText({ _tag: "SendMessage", sessionId: "s", prompt: "hello" })),
      )
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)
      const recorded = yield* Ref.get(calls)

      expect(Socket.isCloseEvent(output)).toBe(true)
      expect(Socket.isCloseEvent(output) && output.code).toBe(1003)
      expect(recorded).toEqual([])
    }),
  )
})
