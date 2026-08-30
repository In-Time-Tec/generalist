import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Scope } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Agent, Steering } from "../../../src/index"

const agent = Agent.make({ name: "steering-test-agent" })

describe("Steering", () => {
  it.effect("binds finite producer-only inboxes to distinct Runs", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const first = yield* Agent.allocateRun(agent, { prompt: "first", sessionId: "shared-session" })
        const second = yield* Agent.allocateRun(agent, { prompt: "second", sessionId: "shared-session" })

        expect(first.runId).not.toBe(second.runId)
        const firstReceipt = yield* first.steer({ prompt: "first correction" })
        const secondReceipt = yield* second.steer({ prompt: "second correction" })
        expect(firstReceipt).toMatchObject({ runId: first.runId, queue: "steering", sequence: 0 })
        expect(secondReceipt).toMatchObject({ runId: second.runId, queue: "steering", sequence: 0 })
      }),
    ),
  )

  it.effect("fails fast at the finite entry bound without partial admission", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const run = yield* Agent.allocateRun(agent, {
          prompt: "start",
          steering: { steering: { capacity: 1 } },
        })
        yield* run.steer({ prompt: "kept" })
        const full = yield* Effect.flip(run.steer({ prompt: "rejected" }))

        expect(full).toBeInstanceOf(Steering.InboxFull)
        expect(full).toMatchObject({
          runId: run.runId,
          queue: "steering",
          dimension: "entries",
          limit: 1,
        })
      }),
    ),
  )

  it.effect("enforces one aggregate encoded-prompt byte bound", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const bytes = Steering.promptBytes(Prompt.make("kept"))
        const run = yield* Agent.allocateRun(agent, {
          prompt: "start",
          steering: { maxPendingBytes: bytes },
        })
        yield* run.steer({ prompt: "kept" })
        const full = yield* Effect.flip(run.followUp({ prompt: "rejected" }))

        expect(full).toBeInstanceOf(Steering.InboxFull)
        expect(full).toMatchObject({
          runId: run.runId,
          queue: "followUp",
          dimension: "bytes",
          limit: bytes,
        })
      }),
    ),
  )

  it.effect("releases a backpressured producer with RunClosed when the Run scope closes", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const run = yield* Agent.allocateRun(agent, {
        prompt: "start",
        steering: { steering: { capacity: 1, onFull: "backpressure" } },
      }).pipe(Scope.provide(scope))
      yield* run.steer({ prompt: "kept" })
      const blocked = yield* run.steer({ prompt: "blocked" }).pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      expect(blocked.pollUnsafe()).toBeUndefined()

      yield* Scope.close(scope, Exit.void)
      const closed = yield* Fiber.join(blocked).pipe(Effect.flip)
      expect(closed).toBeInstanceOf(Steering.RunClosed)
      expect(closed.runId).toBe(run.runId)
    }),
  )

  it.effect("closes admission when an allocated Run scope exits before execution", () =>
    Effect.gen(function* () {
      const scope = yield* Scope.make()
      const run = yield* Agent.allocateRun(agent, { prompt: "never started" }).pipe(Scope.provide(scope))
      yield* run.followUp({ prompt: "queued" })
      yield* Scope.close(scope, Exit.void)

      const closed = yield* Effect.flip(run.followUp({ prompt: "too late" }))
      expect(closed).toBeInstanceOf(Steering.RunClosed)
      expect(closed.runId).toBe(run.runId)
    }),
  )

  it.effect("rejects non-positive and non-integer policies before execution", () =>
    Effect.gen(function* () {
      const invalidCapacity = yield* Effect.scoped(
        Agent.allocateRun(agent, {
          prompt: "never starts",
          steering: { steering: { capacity: 0 } },
        }).pipe(Effect.flip),
      )
      expect(invalidCapacity).toBeInstanceOf(Steering.PolicyInvalid)
      expect(invalidCapacity).toMatchObject({ field: "steering.capacity", value: "0" })

      const invalidBytes = yield* Effect.scoped(
        Agent.allocateRun(agent, {
          prompt: "never starts",
          steering: { maxPendingBytes: 1.5 },
        }).pipe(Effect.flip),
      )
      expect(invalidBytes).toBeInstanceOf(Steering.PolicyInvalid)
      expect(invalidBytes).toMatchObject({ field: "maxPendingBytes", value: "1.5" })
    }),
  )
})
