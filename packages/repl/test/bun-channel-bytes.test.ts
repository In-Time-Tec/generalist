import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { emptyAccumulator, ingest } from "../src/repl/bun-runtime.js"

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
