import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { collect, platform, runCell, withPool } from "../../bun-harness.js"

layer(platform)("Bun kernel namespace", (it) => {
  it.effect("evaluates one cell in a real worker", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "1 + 1" })
          expect(result.value).toBe("2")
        }),
    }),
  )

  it.effect("keeps values across cells in one session", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const a = 41" })
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "a + 1" })
          expect(result.value).toBe("42")
        }),
    }),
  )

  it.effect("persists const, let, function, and class declarations", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              "const k = 2",
              "let m = 3",
              "function twice(n: number) { return n * k }",
              "class Box { constructor(public v: number) {} }",
            ].join("\n"),
          })
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "[twice(m), new Box(7).v].join(',')",
          })
          expect(result.value).toBe("6,7")
        }),
    }),
  )

  it.effect("reassigns a let binding across cells", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "let count = 0" })
          yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "count = count + 5" })
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "count" })
          expect(result.value).toBe("5")
        }),
    }),
  )

  it.effect("evaluates top-level await", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "const v = await Promise.resolve(9); v * 2",
          })
          expect(result.value).toBe("18")
        }),
    }),
  )

  it.effect("keeps a dynamically imported module across cells", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: 'const E = await import("effect")' })
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "typeof E.Effect.succeed" })
          expect(result.value).toBe("function")
        }),
    }),
  )

  it.effect("resolves workspace require from the configured root", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: 'typeof require("effect").Effect.succeed',
          })
          expect(result.value).toBe("function")
        }),
    }),
  )

  it.effect("isolates one session's namespace from another", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "left", cellId: "c1", code: "const only = 1" })
          const result = yield* runCell({ pool, sessionId: "right", cellId: "c1", code: "typeof only" })
          expect(result.value).toBe("undefined")
        }),
    }),
  )

  it.effect("streams a KernelReady event before the cell result", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({ pool, sessionId: "s", cellId: "c1", code: "console.log('hi'); 1" })
          yield* observed.result
          expect(observed.events[0]?._tag).toBe("KernelReady")
          expect(observed.events.map((event) => event.sequence)).toEqual(observed.events.map((_, index) => index))
          expect(observed.events.some((event) => event._tag === "Stdout")).toBe(true)
          expect(observed.events.at(-1)?._tag).toBe("Result")
        }),
    }),
  )
})
