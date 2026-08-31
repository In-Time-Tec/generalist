import { expect, layer } from "@effect/vitest"
import { Context, Deferred, Effect, Exit, Fiber, Layer, Ref, Scope, Tracer } from "effect"
import { TestClock } from "effect/testing"
import { ActiveExecutions, layer as activeExecutionsLayer } from "../../../src/runtime/execution/active-executions.js"

const testTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

layer(activeExecutionsLayer)("ActiveExecutions", (it) => {
  it.effect("registers cancellation before execution startup", () =>
    Effect.gen(function* () {
      const active = yield* ActiveExecutions
      const start = yield* Deferred.make<void>()
      const executed = yield* Ref.make(false)
      const fiber = yield* active
        .run("run-before-start", Deferred.await(start).pipe(Effect.andThen(Ref.set(executed, true)), Effect.asVoid))
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* active.active.pipe(Effect.repeat({ until: (runIds) => runIds.has("run-before-start") }))
      yield* active.interrupt("run-before-start")

      expect((yield* Fiber.await(fiber))._tag).toBe("Success")
      expect(yield* Ref.get(executed)).toBe(false)
    }),
  )

  it.effect("does not deadlock when an execution requests its own cancellation", () =>
    Effect.gen(function* () {
      const active = yield* ActiveExecutions
      const fiber = yield* active
        .run("self-cancel", active.interrupt("self-cancel").pipe(Effect.andThen(Effect.never)))
        .pipe(Effect.forkChild({ startImmediately: true }))

      expect((yield* Fiber.await(fiber))._tag).toBe("Success")
    }),
  )

  it.effect("keeps the first execution when the same run ID is registered twice", () =>
    Effect.gen(function* () {
      const active = yield* ActiveExecutions
      const release = yield* Deferred.make<void>()
      const firstStarted = yield* Deferred.make<void>()
      const secondExecuted = yield* Ref.make(false)
      const first = yield* active
        .run(
          "duplicate",
          Deferred.succeed(firstStarted, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.asVoid),
        )
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(firstStarted)
      yield* active.run("duplicate", Ref.set(secondExecuted, true))

      expect(yield* Ref.get(secondExecuted)).toBe(false)
      expect((yield* active.active).has("duplicate")).toBe(true)

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      expect((yield* active.active).has("duplicate")).toBe(false)
    }),
  )

  it.effect("retains an interrupted execution until its actual exit", () =>
    Effect.gen(function* () {
      const active = yield* ActiveExecutions
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const exited = yield* Deferred.make<void>()
      const settledAfterExit = yield* Deferred.make<void>()
      const running = yield* active
        .run(
          "finite-teardown",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release).pipe(Effect.uninterruptible)),
            Effect.ensuring(Deferred.succeed(exited, undefined)),
          ),
          Effect.gen(function* () {
            expect((yield* active.active).has("finite-teardown")).toBe(false)
            expect(yield* Deferred.isDone(exited)).toBe(true)
            yield* Deferred.succeed(settledAfterExit, undefined)
          }),
        )
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(started)
      yield* active.interrupt("finite-teardown")
      yield* Effect.yieldNow

      expect((yield* active.active).has("finite-teardown")).toBe(true)
      expect(running.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(settledAfterExit)).toBe(false)

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(running)

      expect(yield* Deferred.isDone(exited)).toBe(true)
      expect(yield* Deferred.isDone(settledAfterExit)).toBe(true)
      expect((yield* active.active).has("finite-teardown")).toBe(false)
    }),
  )

  it.effect("observes grace expiry without releasing ownership", () => {
    const tracing = testTracer()
    return Effect.gen(function* () {
      const active = yield* ActiveExecutions
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const running = yield* active
        .run(
          "observed-teardown",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release).pipe(Effect.uninterruptible)),
            Effect.asVoid,
          ),
        )
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(started)
      yield* active.interrupt("observed-teardown")
      yield* Effect.yieldNow
      yield* TestClock.adjust("5 seconds")

      const cancellation = tracing.spans.find((span) => span.name === "Generalist.Runtime.cancel.localExit")
      expect(cancellation?.attributes.get("generalist.runtime.run_id")).toBe("observed-teardown")
      expect(cancellation?.events.map(([name]) => name)).toEqual([
        "generalist.runtime.cancel.interrupt_sent",
        "generalist.runtime.cancel.grace_exceeded",
      ])
      expect((yield* active.active).has("observed-teardown")).toBe(true)
      expect(running.pollUnsafe()).toBeUndefined()

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(running)
      yield* Effect.yieldNow

      expect(cancellation?.events.map(([name]) => name)).toEqual([
        "generalist.runtime.cancel.interrupt_sent",
        "generalist.runtime.cancel.grace_exceeded",
        "generalist.runtime.cancel.local_exit_acknowledged",
      ])
      expect((yield* active.active).has("observed-teardown")).toBe(false)
    }).pipe(Effect.provideService(Tracer.Tracer, tracing.tracer))
  })

  it.effect("waits for owned executions when its layer closes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const context = yield* Layer.buildWithScope(Layer.fresh(activeExecutionsLayer), scope)
      const active = Context.get(context, ActiveExecutions)
      const started = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const running = yield* active
        .run(
          "layer-close",
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release).pipe(Effect.uninterruptible)),
            Effect.asVoid,
          ),
        )
        .pipe(Effect.forkChild({ startImmediately: true }))

      yield* Deferred.await(started)
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow

      expect(closing.pollUnsafe()).toBeUndefined()
      expect(running.pollUnsafe()).toBeUndefined()

      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(closing)
      yield* Fiber.join(running)
    }),
  )
})
