import { expect, layer } from "@effect/vitest"
import { Clock, Effect, Schema } from "effect"
import { Cell } from "../../../../src/repl/index.js"
import { liveOptions, platform, runCell, withPool } from "../../bun-harness.js"

layer(platform, liveOptions)("Bun kernel deadline", (it) => {
  /**
   * The worker's `vm` watchdog terminates synchronous evaluation only, so a cell that awaits never
   * reaches it. The host enforces the profile's deadline itself; otherwise a cell waiting on a hung
   * request holds its Session forever while the profile digest still claims a bound.
   */
  it.effect("bounds a cell that awaits past the deadline", () =>
    withPool({
      overrides: { cellDeadlineMillis: 400, interruptGraceMillis: 150 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const started = yield* Clock.currentTimeMillis
          const failure = yield* Effect.flip(
            runCell({
              pool,
              sessionId: "s",
              cellId: "c1",
              code: "await new Promise((resolve) => setTimeout(resolve, 10000)); 'never'",
            }),
          )
          const elapsed = (yield* Clock.currentTimeMillis) - started
          expect(elapsed).toBeLessThan(9_000)
          expect(Schema.is(Cell.CellFailure)(failure)).toBe(true)
        }),
    }),
  )

  it.effect("leaves a cell that finishes inside the deadline alone", () =>
    withPool({
      overrides: { cellDeadlineMillis: 5_000 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "await new Promise((resolve) => setTimeout(resolve, 100)); 'inside'",
          })
          expect(result.value).toBe("inside")
        }),
    }),
  )

  it.effect("keeps the kernel usable after an overdue async cell is stopped", () =>
    withPool({
      overrides: { cellDeadlineMillis: 400, interruptGraceMillis: 150 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const kept = 8" })
          yield* Effect.flip(
            runCell({
              pool,
              sessionId: "s",
              cellId: "c2",
              code: "await new Promise((resolve) => setTimeout(resolve, 10000)); 'never'",
            }),
          )
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "kept + 1" })
          expect(result.value).toBe("9")
        }),
    }),
  )
})
