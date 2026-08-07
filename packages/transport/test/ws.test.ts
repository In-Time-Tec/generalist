import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Function, Layer, Queue, Ref, Scope, Stream } from "effect"
import { Headers, HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Errors as RuntimeErrors } from "@batonfx/runtime"
import { Wire, Ws } from "../src/index.js"
import { event, runtimeLayer } from "./helpers.js"

interface FakeSocket {
  readonly socket: Socket.Socket
  readonly inbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
  readonly outbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
}

const makeFakeSocket = (): Effect.Effect<FakeSocket> =>
  Effect.gen(function* () {
    const inbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    const outbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    return {
      inbound,
      outbound,
      socket: Socket.make({
        runRaw: (handler) =>
          Effect.gen(function* () {
            while (true) {
              const message = yield* Queue.take(inbound)
              if (Socket.isCloseEvent(message)) return
              const handled = handler(message)
              if (Effect.isEffect(handled)) yield* handled
            }
          }),
        writer: Effect.succeed((chunk) => Queue.offer(outbound, chunk).pipe(Effect.asVoid)),
      }),
    }
  })

const provideScoped = Function.dual<
  <A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
  ) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>>
>(
  2,
  <A, E, R, A2, E2, R2>(
    provided: Layer.Layer<A2, E2, R2>,
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | E2, Scope.Scope | R2 | Exclude<R, A2>> =>
    Effect.scoped(Effect.flatMap(Layer.build(provided), (context) => effect.pipe(Effect.provideContext(context)))),
)

const request = (socket: Socket.Socket): HttpServerRequest.HttpServerRequest =>
  ({
    url: "http://test/ws",
    originalUrl: "http://test/ws",
    headers: Headers.empty,
    upgrade: Effect.succeed(socket),
  }) as unknown as HttpServerRequest.HttpServerRequest

const run = (fake: FakeSocket, layer = runtimeLayer()) =>
  provideScoped(
    layer,
    Ws.handle.pipe(Effect.provideService(HttpServerRequest.HttpServerRequest, request(fake.socket))),
  ).pipe(Effect.forkChild)

describe("Ws", () => {
  it.live("replays after the attached cursor and cancels only on an explicit command", () =>
    Effect.gen(function* () {
      const cancelled = yield* Ref.make<Array<string>>([])
      const fake = yield* makeFakeSocket()
      const fiber = yield* run(
        fake,
        runtimeLayer({ cancel: ({ runId }) => Ref.update(cancelled, (values) => [...values, runId]) }),
      )
      yield* Queue.offer(fake.inbound, yield* Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 1 }))
      const output = yield* Queue.take(fake.outbound)
      expect(typeof output === "string" && (yield* Wire.observerCodec.decode(output)).sequence).toBe(2)
      expect(yield* Ref.get(cancelled)).toEqual([])

      yield* Queue.offer(fake.inbound, yield* Wire.encodeCommand({ _tag: "Cancel", runId: "run-1" }))
      yield* Effect.yieldNow
      expect(yield* Ref.get(cancelled)).toEqual(["run-1"])

      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      expect(yield* Ref.get(cancelled)).toEqual(["run-1"])
      void fiber
    }),
  )

  it.live("closes a lagging subscriber with its last applied cursor", () =>
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>()
      const fake = yield* makeFakeSocket()
      const fiber = yield* run(
        fake,
        runtimeLayer({
          events: () =>
            Stream.succeed(event(3)).pipe(
              Stream.concat(Stream.fromEffect(Deferred.await(release)).pipe(Stream.drain)),
              Stream.concat(
                Stream.fail(RuntimeErrors.SubscriberLagged.make({ runId: "run-1", lastDeliveredSequence: 3 })),
              ),
            ),
        }),
      )
      yield* Queue.offer(fake.inbound, yield* Wire.encodeCommand({ _tag: "Attach", runId: "run-1" }))
      yield* Queue.take(fake.outbound)
      yield* Deferred.succeed(release, undefined)
      const close = yield* Queue.take(fake.outbound)

      expect(Socket.isCloseEvent(close) && close.code).toBe(4000)
      expect(Socket.isCloseEvent(close) && close.reason).toBe("lagged:3")
      yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
      void fiber
    }),
  )
})
