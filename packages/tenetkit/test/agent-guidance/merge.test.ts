import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { Entry, State } from "../../src/agent-guidance/index.js"
import { at, entry } from "./fixtures.js"

const outerScope = "global"
const innerScope = "thread:alpha"

const event = (proposal: string, scope: string, instant: string) =>
  Schema.decodeSync(Entry.RefinementEvent)({
    proposal,
    at: instant,
    scope,
    before: `guidance-snapshot:v1:sha256:${"0".repeat(64)}`,
    after: `guidance-snapshot:v1:sha256:${"1".repeat(64)}`,
    applied: [
      {
        edit: { _tag: "Delete", kind: "memory", id: "gone" },
        before: entry({ id: "gone", kind: "memory", scope }),
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
