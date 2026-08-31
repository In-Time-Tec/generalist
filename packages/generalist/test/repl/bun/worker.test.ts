import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

layer(platform, liveOptions)("Bun kernel worker resilience", (it) => {
  /**
   * Frames are serialized behind one promise. A task that rejects must not carry its rejection
   * forward, because every later task would then be dropped and the worker would answer nothing at
   * all: the host could only recover by killing it, losing the namespace it was protecting.
   *
   * A capture reads every binding, so a cell that defines a throwing getter rejects one, and the
   * pool captures after every cell. The next cell is therefore the evidence.
   */
  it.effect("serves later cells after a capture rejects on a hostile binding", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: `Object.defineProperty(globalThis, "hostile", { get() { throw new Error("no") }, enumerable: true, configurable: true }); 1`,
          })
          const later = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "2 + 3" })
          expect(later.value).toBe("5")
        }),
    }),
  )

  /**
   * An interrupt of a cell that already settled must not reach into the cell admitted after it.
   * The kernel refuses the stale name outright, so the later cell keeps its namespace.
   */
  it.effect("refuses an interrupt naming a cell that already settled", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const kept = 'kept'" })
          const interruption = yield* pool.interrupt("s", "c1")
          expect(interruption._tag).toBe("NotRunning")
          const later = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "kept" })
          expect(later.value).toBe("kept")
        }),
    }),
  )
})
