import { expect, layer } from "@effect/vitest"
import { Duration, Effect } from "effect"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel kernel reuse", (it) => {
  /**
   * A Session must reuse one live kernel process across cells and Runs. A pool that releases the
   * kernel between cells still looks correct for plain values, because a snapshot restores them into
   * the replacement worker; it is module bindings, live handles, and the process identity itself that
   * expose the broken invariant.
   */
  it.effect("keeps one kernel process for a Session across separate executes", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const first = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const pid = process.pid; pid" })
          const second = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "process.pid" })
          const sameBinding = yield* runCell({ pool, sessionId: "s", cellId: "c3", code: "process.pid === pid" })
          expect(second.value).toBe(first.value)
          expect(sameBinding.value).toBe("true")
        }),
    }),
  )

  it.effect("keeps a module binding across cells, which no snapshot can restore", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: 'const E = await import("effect")' })
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "typeof E.Effect.succeed" })
          expect(result.value).toBe("function")
        }),
    }),
  )

  it.effect("keeps a live handle across cells", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "const handle = new AbortController()" })
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "handle instanceof AbortController",
          })
          expect(result.value).toBe("true")
        }),
    }),
  )

  it.effect("gives a different Session a different kernel process", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const left = yield* runCell({ pool, sessionId: "left", cellId: "c1", code: "process.pid" })
          const right = yield* runCell({ pool, sessionId: "right", cellId: "c1", code: "process.pid" })
          expect(left.value).not.toBe(right.value)
        }),
    }),
  )

  it.effect("evicts an idle kernel once its time to live expires", () =>
    withPool({
      overrides: { idleTimeToLive: Duration.millis(1) },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const first = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "process.pid" })
          yield* Effect.sleep(Duration.millis(250))
          const second = yield* runCell({ pool, sessionId: "s", cellId: "c2", code: "process.pid" })
          expect(second.value).not.toBe(first.value)
        }),
    }),
  )
})
