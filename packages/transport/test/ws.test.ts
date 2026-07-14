import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Queue, Ref, Schema, Stream } from "effect"
import { Headers, HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Toolkit } from "effect/unstable/ai"
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

interface FakeSocket {
  readonly socket: Socket.Socket
  readonly inbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
  readonly outbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
}

const makeFakeSocket = (): Effect.Effect<FakeSocket> =>
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
              const result = handler(message)
              if (Effect.isEffect(result)) yield* result
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

const decodeServerFrame = (text: string): Wire.LooseServerFrameType =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Wire.LooseServerFrame))(text)

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

describe("Ws", () => {
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

  it.effect("dispatches client command frames to SessionRegistry", () =>
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

  it.effect("new Attach interrupts and replaces the previous attachment", () =>
    Effect.gen(function* () {
      const fake = yield* makeFakeSocket()
      const firstInterrupted = yield* Deferred.make<void>()
      const fiber = yield* runHandler(
        fake,
        registryLayer({
          attach: (sessionId) =>
            sessionId === "first"
              ? Stream.never.pipe(Stream.ensuring(Deferred.succeed(firstInterrupted, undefined).pipe(Effect.asVoid)))
              : Stream.fromIterable([endedFrame]),
        }),
      )

      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "first" }))
      yield* Effect.yieldNow
      yield* Queue.offer(fake.inbound, clientFrameText({ _tag: "Attach", sessionId: "second" }))
      yield* Deferred.await(firstInterrupted)
      const output = yield* Queue.take(fake.outbound)
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      yield* Fiber.join(fiber)

      expect(typeof output === "string" && decodeServerFrame(output)._tag).toBe("Ended")
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
