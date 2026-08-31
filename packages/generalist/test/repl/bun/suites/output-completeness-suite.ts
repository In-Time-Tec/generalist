import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import type { CellEvent } from "../../../../src/repl/cell.js"
import { collect, liveOptions, platform, runCell, withPool } from "../../bun-harness.js"

const stdoutOf = (events: ReadonlyArray<CellEvent>): string =>
  events.map((event) => (event._tag === "Stdout" ? event.text : "")).join("")

const stderrOf = (events: ReadonlyArray<CellEvent>): string =>
  events.map((event) => (event._tag === "Stderr" ? event.text : "")).join("")

layer(platform, liveOptions)("Bun kernel output completeness", (it) => {
  it.effect("returns and streams stdout beyond the former channel bound", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "process.stdout.write('x'.repeat(300_000)); 'done'",
          })
          const result = yield* observed.result
          expect(result.stdout).toBe("x".repeat(300_000))
          expect(stdoutOf(observed.events)).toBe(result.stdout)
          expect(result.stdout).not.toContain("[truncated:")
        }),
    }),
  )

  it.effect("returns and streams stderr beyond the former channel bound", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "process.stderr.write('y'.repeat(300_000)); 'done'",
          })
          const result = yield* observed.result
          expect(result.stderr).toBe("y".repeat(300_000))
          expect(stderrOf(observed.events)).toBe(result.stderr)
          expect(result.stderr).not.toContain("[truncated:")
        }),
    }),
  )

  it.effect("returns a result beyond the former result bound", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "'z'.repeat(100_000)" })
          expect(result.value).toBe("z".repeat(100_000))
          expect(result.value).not.toContain("[result truncated:")
        }),
    }),
  )
})
