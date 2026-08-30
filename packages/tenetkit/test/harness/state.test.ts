import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Entry, State } from "../../src/harness/index.js"
import { at, entry, scope } from "./fixtures.js"

describe("State", () => {
  it("starts empty for a scope", () => {
    const state = State.empty(scope)
    expect(state.schemaVersion).toBe("1")
    expect(state.scope).toBe(scope)
    expect(State.allEntries(state)).toEqual([])
    expect(state.refinements).toEqual([])
  })

  it("groups entries by kind and sorts each kind by id", () => {
    const state = State.make({
      scope,
      entries: [
        entry({ id: "zulu", kind: "memory" }),
        entry({ id: "alpha", kind: "memory" }),
        entry({ id: "beta", kind: "skill" }),
      ],
    })
    expect(state.entries.memory.map((value) => value.id)).toEqual(["alpha", "zulu"])
    expect(state.entries.skill.map((value) => value.id)).toEqual(["beta"])
    expect(state.entries.prompt).toEqual([])
    expect(state.entries.subagent).toEqual([])
  })

  it("lists every entry in kind then id order", () => {
    const state = State.make({
      scope,
      entries: [
        entry({ id: "s2", kind: "subagent" }),
        entry({ id: "m1", kind: "memory" }),
        entry({ id: "p1", kind: "prompt" }),
        entry({ id: "k1", kind: "skill" }),
        entry({ id: "s1", kind: "subagent" }),
      ],
    })
    expect(State.allEntries(state).map((value) => value.id)).toEqual(["p1", "m1", "k1", "s1", "s2"])
  })

  it("finds one entry by kind and id", () => {
    const state = State.make({ scope, entries: [entry({ id: "one", kind: "memory" })] })
    expect(State.findEntry(state, "memory", "one")?.id).toBe("one")
    expect(State.findEntry(state, "skill", "one")).toBeUndefined()
    expect(State.findEntry(state, "memory", "two")).toBeUndefined()
  })

  it("keeps replaced entries sorted", () => {
    const state = State.withEntries(State.empty(scope), "skill", [
      entry({ id: "zz", kind: "skill" }),
      entry({ id: "aa", kind: "skill" }),
    ])
    expect(state.entries.skill.map((value) => value.id)).toEqual(["aa", "zz"])
  })

  it("digests one state deterministically and independently of input order", () => {
    const left = State.make({
      scope,
      entries: [entry({ id: "b", kind: "memory" }), entry({ id: "a", kind: "memory" })],
    })
    const right = State.make({
      scope,
      entries: [entry({ id: "a", kind: "memory" }), entry({ id: "b", kind: "memory" })],
    })
    expect(State.snapshotId(left)).toBe(State.snapshotId(right))
    expect(State.snapshotId(left)).toMatch(/^guidance-snapshot:v1:sha256:[0-9a-f]{64}$/)
  })

  it("changes the digest when any entry field changes", () => {
    const base = State.make({ scope, entries: [entry({ id: "a", kind: "memory" })] })
    const changed = State.make({
      scope,
      entries: [entry({ id: "a", kind: "memory", content: "different" })],
    })
    const reversioned = State.make({ scope, entries: [entry({ id: "a", kind: "memory", version: 2 })] })
    const rekinded = State.make({ scope, entries: [entry({ id: "a", kind: "skill" })] })
    const ids = new Set([base, changed, reversioned, rekinded].map(State.snapshotId))
    expect(ids.size).toBe(4)
  })

  it("changes the digest when the scope changes", () => {
    const left = State.make({ scope, entries: [] })
    const right = State.make({ scope: "global", entries: [] })
    expect(State.snapshotId(left)).not.toBe(State.snapshotId(right))
  })

  it("ignores refinement history in the digest", () => {
    const entries = [entry({ id: "a", kind: "memory" })]
    const withoutHistory = State.make({ scope, entries })
    const withHistory = State.make({
      scope,
      entries,
      refinements: [
        {
          proposal: "p1",
          at: at(1),
          scope,
          before: State.snapshotId(withoutHistory),
          after: State.snapshotId(withoutHistory),
          applied: [{ edit: { _tag: "Delete", kind: "memory", id: "gone" } }],
        },
      ],
    })
    expect(State.snapshotId(withHistory)).toBe(State.snapshotId(withoutHistory))
  })

  it("round-trips one state through its schema", () => {
    const state = State.make({
      scope,
      entries: [entry({ id: "a", kind: "memory", arguments: { limit: 3 }, metadata: { pinned: true } })],
    })
    const encoded = Schema.encodeSync(State.GuidanceState)(state)
    expect(Schema.decodeSync(State.GuidanceState)(encoded)).toEqual(state)
  })

  it("rejects an out-of-contract entry", () => {
    const invalidKind = { ...entry({ id: "a", kind: "memory" }), kind: "other" }
    expect(() =>
      Schema.decodeSync(Entry.GuidanceEntry)({ ...entry({ id: "a", kind: "memory" }), version: 0 }),
    ).toThrow()
    expect(() => Schema.decodeUnknownSync(Entry.GuidanceEntry)(invalidKind)).toThrow()
    expect(() =>
      Schema.decodeSync(Entry.GuidanceEntry)({
        ...entry({ id: "a", kind: "memory" }),
        updatedAt: "2024-01-01",
      }),
    ).toThrow()
  })

  it("projects one entry back to its value and revision", () => {
    const value = entry({ id: "a", kind: "skill", reference: "pkg.run", arguments: { depth: 1 } })
    expect(Entry.value(value)).toEqual({
      title: value.title,
      content: value.content,
      reference: "pkg.run",
      arguments: { depth: 1 },
    })
    expect(Entry.revision(value)).toEqual({ createdAt: at(0), updatedAt: at(0), version: 1 })
  })

  it("names every kind exactly once in canonical order", () => {
    expect(Entry.kinds).toEqual(["prompt", "memory", "skill", "subagent"])
  })
})
