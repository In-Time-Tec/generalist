import { expect, layer } from "@effect/vitest"
import { Effect, Fiber, Schema } from "effect"
import { Cell } from "../../../src/repl/index.js"
import { collect, liveOptions, platform, runCell, withPool } from "../bun-harness.js"

layer(platform, liveOptions)("Bun kernel cell failure", (it) => {
  /**
   * A cell that throws is model input, not a framework failure: the namespace, the kernel, and every
   * prior binding survive it. A cell that outruns its deadline is terminated in place by the `vm`
   * watchdog, which leaves the context and the worker intact.
   */
  it.effect("reports a thrown cell as a typed execution failure", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            runCell({ pool, sessionId: "s", cellId: "c1", code: "throw new TypeError('boom')" }),
          )
          expect(Schema.is(Cell.CellExecutionFailed)(failure)).toBe(true)
          if (Schema.is(Cell.CellExecutionFailed)(failure)) {
            expect(failure.name).toBe("TypeError")
            expect(failure.message).toContain("boom")
            expect(failure.message).toContain(failure.hint)
            expect(failure.cellId).toBe("c1")
          }
        }),
    }),
  )

  it.effect("keeps every prior binding after a cell throws", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const kept = 11" })
          yield* Effect.flip(runCell({ pool, sessionId: "s", cellId: "c2", code: "throw new Error('boom')" }))
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "kept + 1" })
          expect(result.value).toBe("12")
        }),
    }),
  )

  it.effect("carries the failing cell's stderr on the typed failure", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            runCell({
              pool,
              sessionId: "s",
              cellId: "c1",
              code: "console.error('before the throw'); throw new Error('boom')",
            }),
          )
          if (Schema.is(Cell.CellExecutionFailed)(failure)) {
            expect(failure.stderr).toContain("before the throw")
          }
        }),
    }),
  )

  it.effect("terminates a synchronous loop that outruns the cell deadline", () =>
    withPool({
      overrides: { cellDeadlineMillis: 300 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(runCell({ pool, sessionId: "s", cellId: "c1", code: "while (true) {}" }))
          expect(Schema.is(Cell.CellExecutionFailed)(failure)).toBe(true)
          if (Schema.is(Cell.CellExecutionFailed)(failure)) expect(failure.name).toBe("Celltimed-out")
        }),
    }),
  )

  it.effect("keeps the namespace and runs the next cell after a deadline termination", () =>
    withPool({
      overrides: { cellDeadlineMillis: 300 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const survivor = 3" })
          yield* Effect.flip(runCell({ pool, sessionId: "s", cellId: "c2", code: "while (true) {}" }))
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "survivor * 2" })
          expect(result.value).toBe("6")
        }),
    }),
  )

  it.effect("interrupts a waiting cell in place and keeps the kernel usable", () =>
    withPool({
      overrides: { cellDeadlineMillis: 20_000 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const before = 'kept'" })
          const execution = yield* pool.execute({
            sessionId: "s",
            cellId: "c2",
            code: "await new Promise((resolve) => setTimeout(resolve, 10000)); 'never'",
          })
          const awaiting = yield* Effect.forkChild(Effect.exit(execution.result))
          const interruption = yield* pool.interrupt("s", "c2")
          expect(interruption._tag).toBe("Interrupted")
          const outcome = yield* Fiber.join(awaiting)
          expect(outcome._tag).toBe("Failure")
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "before" })
          expect(result.value).toBe("kept")
        }),
    }),
  )

  it.effect("reports an interrupt for a cell that is not running", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "1" })
          const interruption = yield* pool.interrupt("s", "not-running")
          expect(interruption._tag).toBe("NotRunning")
        }),
    }),
  )

  it.effect("streams the failing cell's events before the failure", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "console.log('printed'); throw new Error('boom')",
          })
          yield* Effect.flip(observed.result)
          expect(observed.events.some((event) => event._tag === "Stdout")).toBe(true)
          expect(observed.events.map((event) => event.sequence)).toEqual(observed.events.map((_, index) => index))
        }),
    }),
  )

  it.effect("refuses a cell whose source exceeds the profile bound", () =>
    withPool({
      overrides: { sourceBytes: 64 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const failure = yield* Effect.flip(
            runCell({ pool, sessionId: "s", cellId: "c1", code: `const padding = "${"x".repeat(200)}"` }),
          )
          expect(Schema.is(Cell.KernelUnavailable)(failure)).toBe(true)
          if (Schema.is(Cell.KernelUnavailable)(failure)) expect(failure.reason).toBe("profile-mismatch")
        }),
    }),
  )

  it.effect("accepts a cell inside the profile source bound", () =>
    withPool({
      overrides: { sourceBytes: 64 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "1 + 1" })
          expect(result.value).toBe("2")
        }),
    }),
  )
})
