import "./suites/bun-result-rendering-suite.js"
import { expect, it as test, layer } from "@effect/vitest"
import { Effect } from "effect"
import { maxResultBytes, toCellEvent } from "../../src/repl/bun/runtime.js"
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
          expect(result.value).toContain("[result truncated: kept first")
          expect(result.value).toContain("of 100000 bytes")
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

test("keeps an exactly-at-limit result without a truncation marker", () => {
  const value = "x".repeat(maxResultBytes)
  const event = toCellEvent({ _tag: "Completed", cellId: "cell", value, durationMillis: 0 }, 0)
  expect(event?._tag).toBe("Result")
  if (event?._tag !== "Result") return
  expect(event.value).toBe(value)
  expect(event.value).not.toContain("[result truncated:")
})

test("bounds a multibyte result on a valid UTF-8 prefix", () => {
  const value = `${"x".repeat(maxResultBytes - 1)}🙂TAIL`
  const event = toCellEvent({ _tag: "Completed", cellId: "cell", value, durationMillis: 0 }, 0)
  expect(event?._tag).toBe("Result")
  if (event?._tag !== "Result") return
  const [kept, marker] = event.value.split("\n[result truncated:")
  expect(kept).toBe("x".repeat(maxResultBytes - 1))
  expect(new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(kept))).toBe(kept)
  expect(marker).toContain(`kept first ${maxResultBytes - 1} of ${new TextEncoder().encode(value).byteLength} bytes`)
  expect(event.value).not.toContain("TAIL")
  expect(event.value.match(/\[result truncated:/g)).toHaveLength(1)
})
