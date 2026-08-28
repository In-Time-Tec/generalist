import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import type { CellEvent } from "../../../../src/repl/cell.js"
import { collect, liveOptions, platform, runCell, withPool } from "../../bun-harness.js"

layer(platform, liveOptions)("Bun kernel output bounds", (it) => {
  const channelBytes = 4_096

  const stdoutOf = (events: ReadonlyArray<CellEvent>): string =>
    events.map((event) => (event._tag === "Stdout" ? event.text : "")).join("")

  const stderrOf = (events: ReadonlyArray<CellEvent>): string =>
    events.map((event) => (event._tag === "Stderr" ? event.text : "")).join("")

  /**
   * Output is bounded before it reaches the model's context. A cell that floods a channel is
   * truncated at the kernel, and the truncation is reported honestly: how many bytes and how many
   * events were dropped, so nothing is silently lost.
   */
  it.effect("bounds a flooded stdout channel and reports what it dropped", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "for (let index = 0; index < 2000; index += 1) { console.log('x'.repeat(200)) }; 'done'",
          })
          const result = yield* observed.result
          expect(stdoutOf(observed.events).length).toBeLessThanOrEqual(channelBytes)
          const truncation = result.truncation.find((entry) => entry.channel === "stdout")
          expect(truncation).toBeDefined()
          expect(truncation?.droppedBytes ?? 0).toBeGreaterThan(0)
          expect(truncation?.droppedEvents ?? 0).toBeGreaterThan(0)
        }),
    }),
  )

  it.effect("streams an OutputTruncated event when a channel hits its bound", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "for (let index = 0; index < 2000; index += 1) { console.log('y'.repeat(200)) }; 'done'",
          })
          yield* observed.result
          const truncated = observed.events.find((event) => event._tag === "OutputTruncated")
          expect(truncated).toBeDefined()
          if (truncated?._tag === "OutputTruncated") {
            expect(truncated.channel).toBe("stdout")
            expect(truncated.droppedBytes).toBeGreaterThan(0)
          }
        }),
    }),
  )

  it.effect("bounds a flooded stderr channel independently of stdout", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              "console.log('short stdout')",
              "for (let index = 0; index < 2000; index += 1) { console.error('z'.repeat(200)) }",
              "'done'",
            ].join("\n"),
          })
          const result = yield* observed.result
          expect(result.stdout).toContain("short stdout")
          expect(stderrOf(observed.events).length).toBeLessThanOrEqual(channelBytes)
          expect(result.truncation.some((entry) => entry.channel === "stderr")).toBe(true)
        }),
    }),
  )

  it.effect("keeps the kernel usable after a flood", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const flooded = yield* collect({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: "const after = 4; for (let index = 0; index < 100; index += 1) { console.log('w'.repeat(200)) }; 'done'",
          })
          yield* flooded.result
          const observed = yield* collect({ pool, sessionId: "s", cellId: "c2", code: "after + 1" })
          const result = yield* observed.result
          expect(result.value).toBe("5")
          expect(result.truncation).toEqual([])
        }),
    }),
  )

  /**
   * A cell's output is not only what the kernel's own `console` produced. A cell that writes to the
   * process's stdout directly, or shells out to a project command with inherited descriptors, is
   * the ordinary case in this kernel — PLAN.md's own happy path — so those bytes have to reach the
   * model too, and they have to be bounded by the same budget. Metering inside the worker could see
   * only the first kind; the host sees them all.
   */
  it.effect("delivers output a cell wrote straight to the process stdout", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["require('node:fs').writeSync(1, 'RAW-WRITE\\n')", "'done'"].join("\n"),
          })
          expect(result.value).toBe("done")
          expect(result.stdout).toContain("RAW-WRITE")
        }),
    }),
  )

  it.effect("delivers output a subprocess wrote to an inherited descriptor", () =>
    withPool({
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: ["Bun.spawnSync(['echo', 'SUBPROCESS-OUTPUT'], { stdout: 'inherit' })", "'done'"].join("\n"),
          })
          expect(result.value).toBe("done")
          expect(result.stdout).toContain("SUBPROCESS-OUTPUT")
        }),
    }),
  )

  it.effect("bounds a direct stdout write against the channel bound", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              "const fs = require('node:fs')",
              "for (let index = 0; index < 100; index += 1) { fs.writeSync(1, 'A'.repeat(200)) }",
              "'done'",
            ].join("\n"),
          })
          const [kept, marker] = result.stdout.split("\n[truncated:")
          expect(new TextEncoder().encode(kept).byteLength).toBeLessThanOrEqual(channelBytes)
          expect(marker).toContain("kept first")
          expect(result.truncation.some((entry) => entry.channel === "stdout")).toBe(true)
        }),
    }),
  )

  it.effect("bounds a flooding subprocess that inherited the descriptor", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({
            pool,
            sessionId: "s",
            cellId: "c1",
            code: [
              "Bun.spawnSync(['bash', '-c', 'for i in $(seq 1 500); do echo FLOOD-$i; done'], { stdout: 'inherit' })",
              "'done'",
            ].join("\n"),
          })
          const [kept, marker] = result.stdout.split("\n[truncated:")
          expect(new TextEncoder().encode(kept).byteLength).toBeLessThanOrEqual(channelBytes)
          expect(marker).toContain("kept first")
          expect(result.truncation.some((entry) => entry.channel === "stdout")).toBe(true)
        }),
    }),
  )

  it.effect("reports no truncation for a cell within its bounds", () =>
    withPool({
      overrides: { channelBytes },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const observed = yield* collect({ pool, sessionId: "s", cellId: "c1", code: "console.log('small'); 1" })
          const result = yield* observed.result
          expect(result.truncation).toEqual([])
          expect(observed.events.some((event) => event._tag === "OutputTruncated")).toBe(false)
        }),
    }),
  )
})
