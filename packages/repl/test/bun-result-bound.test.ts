import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { maxResultBytes } from "../src/repl/bun-runtime.js"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel result bound", (it) => {
  /**
   * A cell's result enters the model's context whole, so it is bounded like every other channel.
   * The marker names the numbers and the recovery, and the truncation account reports the drop.
   */
  it.effect("bounds an oversized result and names what it dropped", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "'x'.repeat(100_000)",
          })
          expect(new TextEncoder().encode(result.value).byteLength).toBeLessThan(maxResultBytes + 256)
          expect(result.value).toContain("[result truncated: showing")
          expect(result.value).toContain("still in the kernel")
          const truncation = result.truncation.find((entry) => entry.channel === "result")
          expect(truncation?.droppedBytes ?? 0).toBeGreaterThan(0)
        }),
    }),
  )

  it.effect("leaves a small result untouched", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "'small'" })
          expect(result.value).toBe("small")
          expect(result.truncation).toEqual([])
        }),
    }),
  )
})
