import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { emptyAccumulator, ingest, terminal } from "../src/repl/bun-runtime.js"

const bytesOf = (text: string): number => new TextEncoder().encode(text).byteLength

it.effect("keeps a multibyte channel within its byte bound", () =>
  Effect.sync(() => {
    const result = ingest(emptyAccumulator, { channel: "stdout", text: "\u65e5".repeat(10), limit: 10 })
    expect(bytesOf(result.kept)).toBeLessThanOrEqual(10)
    expect(result.truncated).toBe(true)
    expect(result.channels.stdout.bytes).toBe(bytesOf(result.channels.stdout.text))
  }),
)

it.effect("never splits a surrogate pair at the bound", () =>
  Effect.sync(() => {
    const result = ingest(emptyAccumulator, { channel: "stdout", text: "\u{1F600}".repeat(4), limit: 6 })
    expect(bytesOf(result.kept)).toBeLessThanOrEqual(6)
    expect(result.kept).toBe([...result.kept].join(""))
  }),
)

it.effect("reports dropped bytes whenever it reports a dropped event", () =>
  Effect.sync(() => {
    const result = ingest(emptyAccumulator, { channel: "stdout", text: "\u65e5".repeat(10), limit: 10 })
    expect(result.channels.stdout.droppedEvents).toBe(1)
    expect(result.channels.stdout.droppedBytes).toBeGreaterThan(0)
  }),
)

it.effect("renders an honest prefix marker for a truncated channel", () =>
  Effect.sync(() => {
    const text = `HEAD-${"x".repeat(10)}-TAIL`
    const ingested = ingest(emptyAccumulator, { channel: "stdout", text, limit: 8 })
    const outcome = terminal(
      { _tag: "Completed", cellId: "cell", value: "done", durationMillis: 0 },
      { sessionId: "session", epoch: 0, sequence: 0, channels: ingested.channels },
    )
    expect(ingested.truncated).toBe(true)
    expect(outcome?.result?.stdout).toBe(
      `HEAD-xxx\n[truncated: kept first 8 of ${bytesOf(text)} bytes — page or narrow the command]`,
    )
    expect(outcome?.result?.stdout).not.toContain("TAIL")
  }),
)

it.effect("keeps exact-bound and multibyte channel output intact", () =>
  Effect.sync(() => {
    const text = "日🙂"
    const ingested = ingest(emptyAccumulator, { channel: "stdout", text, limit: bytesOf(text) })
    const outcome = terminal(
      { _tag: "Completed", cellId: "cell", value: "done", durationMillis: 0 },
      { sessionId: "session", epoch: 0, sequence: 0, channels: ingested.channels },
    )
    expect(ingested.truncated).toBe(false)
    expect(ingested.kept).toBe(text)
    expect(outcome?.result?.stdout).toBe(text)
    expect(outcome?.result?.stdout).not.toContain("[truncated:")
  }),
)

it.effect("seals a channel after the first dropped byte", () =>
  Effect.sync(() => {
    const first = ingest(emptyAccumulator, { channel: "stdout", text: "🙂", limit: 2 })
    const second = ingest(first.channels, { channel: "stdout", text: "Z", limit: 2 })
    const outcome = terminal(
      { _tag: "Completed", cellId: "cell", value: "done", durationMillis: 0 },
      { sessionId: "session", epoch: 0, sequence: 0, channels: second.channels },
    )
    expect(second.kept).toBe("")
    expect(second.truncated).toBe(true)
    expect(outcome?.result?.stdout).toBe(
      "[truncated: kept first 0 of 5 bytes — page or narrow the command]",
    )
    expect(outcome?.result?.stdout.match(/\[truncated:/g)).toHaveLength(1)
  }),
)

it.effect("does not truncate empty writes at an exhausted bound", () =>
  Effect.sync(() => {
    const full = ingest(emptyAccumulator, { channel: "stdout", text: "x", limit: 1 })
    const empty = ingest(full.channels, { channel: "stdout", text: "", limit: 1 })
    expect(empty.truncated).toBe(false)
    expect(empty.channels.stdout).toEqual(full.channels.stdout)
  }),
)

it.effect("marks truncated stderr on a stopped cell once", () =>
  Effect.sync(() => {
    const text = `HEAD-${"x".repeat(10)}-TAIL`
    const ingested = ingest(emptyAccumulator, { channel: "stderr", text, limit: 8 })
    const outcome = terminal(
      { _tag: "Stopped", cellId: "cell", kind: "threw", name: "Error", message: "boom", durationMillis: 0 },
      { sessionId: "session", epoch: 0, sequence: 0, channels: ingested.channels },
    )
    expect(outcome?.failure?.stderr).toContain(`kept first 8 of ${bytesOf(text)} bytes`)
    expect(outcome?.failure?.stderr).toContain("page or narrow the command")
    expect(outcome?.failure?.stderr.match(/\[truncated:/g)).toHaveLength(1)
  }),
)

