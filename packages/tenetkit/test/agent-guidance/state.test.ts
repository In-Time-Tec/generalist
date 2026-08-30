import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Entry, State } from "../../src/agent-guidance/index.js"
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

const outerScope = "global"
const innerScope = "thread:alpha"

const event = (proposal: string, eventScope: string, instant: string) =>
  Schema.decodeSync(Entry.RefinementEvent)({
    proposal,
    at: instant,
    scope: eventScope,
    before: `guidance-snapshot:v1:sha256:${"0".repeat(64)}`,
    after: `guidance-snapshot:v1:sha256:${"1".repeat(64)}`,
    applied: [
      {
        edit: { _tag: "Delete", kind: "memory", id: "gone" },
        before: entry({ id: "gone", kind: "memory", scope: eventScope }),
      },
    ],
  })

const outer = State.make({
  scope: outerScope,
  entries: [
    entry({ id: "shared", kind: "memory", scope: outerScope, content: "outer" }),
    entry({ id: "outer-only", kind: "memory", scope: outerScope }),
    entry({ id: "shared", kind: "skill", scope: outerScope, content: "outer skill" }),
  ],
  refinements: [event("outer-1", outerScope, at(1))],
})

const inner = State.make({
  scope: innerScope,
  entries: [
    entry({ id: "shared", kind: "memory", scope: innerScope, content: "inner", version: 7 }),
    entry({ id: "inner-only", kind: "prompt", scope: innerScope }),
  ],
  refinements: [event("inner-1", innerScope, at(2))],
})

const merged = State.merge(outer, inner)

describe("State.merge", () => {
  it("lets the inner scope win an id collision within a kind", () => {
    const winner = State.findEntry(merged, "memory", "shared")!
    expect(winner.content).toBe("inner")
    expect(winner.scope).toBe(innerScope)
    expect(winner.version).toBe(7)
  })

  it("keeps outer entries the inner scope does not override", () => {
    expect(State.findEntry(merged, "memory", "outer-only")?.scope).toBe(outerScope)
    expect(State.findEntry(merged, "skill", "shared")?.content).toBe("outer skill")
  })

  it("keeps inner entries the outer scope does not hold", () => {
    expect(State.findEntry(merged, "prompt", "inner-only")?.scope).toBe(innerScope)
  })

  it("overrides only within the same kind", () => {
    expect(State.findEntry(merged, "skill", "shared")?.scope).toBe(outerScope)
    expect(State.findEntry(merged, "memory", "shared")?.scope).toBe(innerScope)
  })

  it("takes the inner scope as the merged scope", () => {
    expect(merged.scope).toBe(innerScope)
  })

  it("keeps every kind sorted by id", () => {
    expect(merged.entries.memory.map((value) => value.id)).toEqual(["outer-only", "shared"])
  })

  it("merges refinement history in instant order", () => {
    expect(merged.refinements.map((value) => value.proposal)).toEqual(["outer-1", "inner-1"])
  })

  it("orders equal instants by scope then proposal deterministically", () => {
    const left = State.make({ scope: "a", refinements: [event("z", "a", at(3)), event("y", "a", at(3))] })
    const right = State.make({ scope: "b", refinements: [event("x", "b", at(3))] })
    expect(State.merge(left, right).refinements.map((value) => value.proposal)).toEqual(["y", "z", "x"])
  })

  it("is deterministic across repeated merges", () => {
    expect(State.snapshotId(State.merge(outer, inner))).toBe(State.snapshotId(merged))
  })

  it("is not commutative when a scope overrides", () => {
    const reversed = State.merge(inner, outer)
    expect(State.findEntry(reversed, "memory", "shared")?.content).toBe("outer")
    expect(State.snapshotId(reversed)).not.toBe(State.snapshotId(merged))
  })

  it("chains three scopes with the innermost winning", () => {
    const middle = State.make({
      scope: "workspace",
      entries: [entry({ id: "shared", kind: "memory", scope: "workspace", content: "middle" })],
    })
    const chained = State.merge(State.merge(outer, middle), inner)
    expect(State.findEntry(chained, "memory", "shared")?.content).toBe("inner")
    expect(State.findEntry(chained, "memory", "outer-only")).toBeDefined()
  })

  it("returns the inner state unchanged against an empty outer scope", () => {
    const result = State.merge(State.empty(outerScope), inner)
    expect(State.allEntries(result)).toEqual(State.allEntries(inner))
  })

  it("adopts every outer entry against an empty inner scope", () => {
    const result = State.merge(outer, State.empty(innerScope))
    expect(State.allEntries(result).map((value) => value.id)).toEqual(State.allEntries(outer).map((value) => value.id))
    expect(result.scope).toBe(innerScope)
  })
})
