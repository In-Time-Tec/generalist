import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import type { CellEvent } from "../../src/repl/repl/cell.js"
import { collect, liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel cell isolation", (it) => {
  const stdoutOf = (events: ReadonlyArray<CellEvent>): string =>
    events.map((event) => (event._tag === "Stdout" ? event.text : "")).join("")

  /**
   * Output belongs to the cell that produced it. A callback scheduled by one cell can fire while a
   * later cell is running; when it does, its output must not be relabelled with the later cell's
   * identity, because the transcript would then show one cell's work under another.
   */
  it.effect("does not attribute a prior cell's deferred output to the next cell", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "setTimeout(() => { console.log('from-c1') }, 150); 'c1'",
          })
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "await new Promise((resolve) => setTimeout(resolve, 500)); 'c2'",
          })
          yield* observed.result
          expect(stdoutOf(observed.events)).not.toContain("from-c1")
        }),
    }),
  )

  it.effect("keeps every streamed event of a cell tagged with that cell's identity", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "only",
            code: "console.log('a'); console.error('b'); 'done'",
          })
          yield* observed.result
          expect(observed.events.every((event) => event.cellId === "only")).toBe(true)
        }),
    }),
  )

  it.effect("does not deliver an interrupted cell's resumed output into the next cell", () =>
    withPool({
      overrides: { cellDeadlineMillis: 20_000 },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const first = yield* pool.execute({
            sessionId: "s",
            cellId: "c1",
            code: "await new Promise((resolve) => setTimeout(resolve, 400)); console.log('c1-resumed'); 'c1'",
            signal: AbortSignal.any([]),
          })
          yield* pool.interrupt("s", "c1")
          yield* Effect.exit(first.result)
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c2",
            code: "await new Promise((resolve) => setTimeout(resolve, 600)); 'c2'",
          })
          yield* observed.result
          expect(stdoutOf(observed.events)).not.toContain("c1-resumed")
        }),
    }),
  )
})
