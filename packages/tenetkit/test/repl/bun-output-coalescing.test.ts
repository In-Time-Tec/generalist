import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import type { CellEvent } from "../../src/repl/repl/cell.js"
import { collect, liveOptions, platform, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel output coalescing", (it) => {
  const stdoutEvents = (events: ReadonlyArray<CellEvent>): ReadonlyArray<string> =>
    events.flatMap((event) => (event._tag === "Stdout" ? [event.text] : []))

  /**
   * A cell that logs in a tight loop must not emit one durable event per call: adjacent
   * same-channel writes coalesce into one frame, and the cell's aggregate text is unchanged.
   */
  it.effect("coalesces a logging loop into far fewer events than calls", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "for (let index = 0; index < 200; index += 1) { console.log('line-' + index) }; 'done'",
          })
          const result = yield* observed.result
          const chunks = stdoutEvents(observed.events)
          expect(chunks.length).toBeLessThan(20)
          expect(result.stdout).toBe(Array.from({ length: 200 }, (_, index) => `line-${index}\n`).join(""))
        }),
    }),
  )

  it.effect("flushes on a channel switch so stdout and stderr keep their order", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["console.log('first-out')", "console.error('then-err')", "console.log('last-out')", "'done'"].join(
              "\n",
            ),
          })
          const result = yield* observed.result
          const ordered = observed.events.flatMap((event) =>
            event._tag === "Stdout" || event._tag === "Stderr" ? [`${event._tag}:${event.text}`] : [],
          )
          expect(ordered).toEqual(["Stdout:first-out\n", "Stderr:then-err\n", "Stdout:last-out\n"])
          expect(result.stdout).toBe("first-out\nlast-out\n")
          expect(result.stderr).toBe("then-err\n")
        }),
    }),
  )

  it.effect("flushes pending output before the cell result", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "console.log('pending'); 'value'",
          })
          const result = yield* observed.result
          expect(result.stdout).toBe("pending\n")
          const resultIndex = observed.events.findIndex((event) => event._tag === "Result")
          const stdoutIndex = observed.events.findIndex((event) => event._tag === "Stdout")
          expect(stdoutIndex).toBeGreaterThanOrEqual(0)
          expect(stdoutIndex).toBeLessThan(resultIndex)
        }),
    }),
  )
})
