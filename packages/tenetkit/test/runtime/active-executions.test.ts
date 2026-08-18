import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Ref } from "effect"
import { ActiveExecutions, layer as activeExecutionsLayer } from "../../src/runtime/active-executions.js"

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
})
