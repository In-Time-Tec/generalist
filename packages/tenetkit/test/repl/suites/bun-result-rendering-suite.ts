import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

layer(platform, liveOptions)("Bun kernel result rendering", (it) => {
  /**
   * Every value a cell makes lives in the `vm` context's realm, so an inspector that hides
   * inherited properties only behind the host realm's prototypes would render a plain `{id: "x"}`
   * with the ten methods of its foreign `Object.prototype` appended. The rendered result carries
   * own enumerable properties only.
   */
  it.effect("renders a plain object as canonical JSON", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "[{status: 'running', id: 'x'}]",
          })
          expect(result.value).toBe('[{"id":"x","status":"running"}]')
        }),
    }),
  )

  it.effect("renders console output without inherited prototype methods", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "console.log([1, 2].map((n) => ({ n }))); 'done'",
          })
          expect(result.stdout).toContain("n: 1")
          expect(result.stdout).not.toContain("__defineGetter__")
        }),
    }),
  )

  it.effect("still names a thrown-and-returned error by its message", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "new Error('named boom')",
          })
          expect(result.value).toContain("named boom")
        }),
    }),
  )

  it.effect("falls back to inspection for non-JSON values", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "1n" })
          expect(result.value).toBe("1n")
        }),
    }),
  )
})
