import { describe, expect, it } from "@effect/vitest"
import { Entry, Overview, State } from "../../src/harness/index.js"
import { applied, create, entry, proposal, scope } from "./fixtures.js"

const many = (kind: Entry.GuidanceKind, count: number) =>
  Array.from({ length: count }, (_, index) =>
    entry({ id: `${kind}-${String(index).padStart(3, "0")}`, kind, content: "x".repeat(2_000) }),
  )

const large = State.make({
  scope,
  entries: [...many("prompt", 40), ...many("memory", 40), ...many("skill", 40), ...many("subagent", 40)],
})

const withRefinements = (count: number): State.GuidanceState => {
  let state = State.empty(scope)
  for (let step = 0; step < count; step += 1) {
    state = applied({
      state,
      proposal: proposal({
        id: `p${String(step).padStart(3, "0")}`,
        edits: [create({ kind: "memory", id: `m${step}` })],
      }),
    }).state
  }
  return state
}

describe("Overview.format", () => {
  it("names every kind with its total count", () => {
    const text = Overview.format(large, { maxEntriesPerKind: 2 })
    for (const kind of ["prompt", "memory", "skill", "subagent"]) {
      expect(text).toContain(`${kind}: 40 (showing 2)`)
    }
  })

  it("never lists more than the entry bound per kind", () => {
    const text = Overview.format(large, { maxEntriesPerKind: 3 })
    for (const kind of ["prompt", "memory", "skill", "subagent"]) {
      const lines = text.split("\n").filter((line) => line.startsWith(`- ${kind}-`))
      expect(lines).toHaveLength(3)
    }
  })

  it("never emits content longer than the content bound", () => {
    const text = Overview.format(large, { maxEntriesPerKind: 4, maxContentLength: 30 })
    for (const line of text.split("\n").filter((value) => value.includes("\u2014"))) {
      expect(line.slice(line.indexOf("\u2014") + 2).length).toBeLessThanOrEqual(30)
    }
  })

  it("never emits a title longer than the title bound", () => {
    const state = State.make({ scope, entries: [entry({ id: "a", kind: "memory", title: "t".repeat(500) })] })
    const text = Overview.format(state, { maxTitleLength: 12 })
    expect(text).toContain(`${"t".repeat(11)}\u2026`)
    expect(text).not.toContain("t".repeat(13))
  })

  it("bounds total output regardless of state size", () => {
    const small = State.make({ scope, entries: many("memory", 1) })
    const options = { maxEntriesPerKind: 2, maxContentLength: 40, maxTitleLength: 20, maxRefinements: 2 }
    const smallText = Overview.format(small, options)
    const largeText = Overview.format(large, options)
    expect(largeText.length).toBeLessThan(smallText.length + 2_000)
  })

  it("does not grow when the state grows past the bounds", () => {
    const options = { maxEntriesPerKind: 2, maxContentLength: 20, maxTitleLength: 20, maxRefinements: 1 }
    const bigger = State.make({
      scope,
      entries: [
        ...State.allEntries(large),
        ...many("memory", 40).map((value) => ({ ...value, id: `${value.id}-extra` })),
      ],
    })
    const first = Overview.format(large, options)
    const second = Overview.format(bigger, options)
    expect(second.split("\n").length).toBe(first.split("\n").length)
  })

  it("selects entries deterministically by id", () => {
    const text = Overview.format(large, { maxEntriesPerKind: 2 })
    expect(text).toContain("- memory-000")
    expect(text).toContain("- memory-001")
    expect(text).not.toContain("- memory-002")
  })

  it("is stable across repeated calls", () => {
    const options = { maxEntriesPerKind: 5 }
    expect(Overview.format(large, options)).toBe(Overview.format(large, options))
  })

  it("renders kinds in canonical order", () => {
    const text = Overview.format(large, { maxEntriesPerKind: 0 })
    const order = ["prompt: 40", "memory: 40", "skill: 40", "subagent: 40"].map((value) => text.indexOf(value))
    expect(order).toEqual(order.toSorted((left, right) => left - right))
    expect(order.every((index) => index >= 0)).toBe(true)
  })

  it("never lists more than the refinement bound", () => {
    const state = withRefinements(12)
    const text = Overview.format(state, { maxRefinements: 3 })
    expect(text).toContain("recent refinements: 12 (showing 3)")
    expect(text.split("\n").filter((line) => line.includes(": Create:memory/"))).toHaveLength(3)
  })

  it("shows the most recent refinements", () => {
    const text = Overview.format(withRefinements(6), { maxRefinements: 2 })
    expect(text).toContain("p005")
    expect(text).not.toContain("p003")
  })

  it("collapses whitespace in content and titles", () => {
    const state = State.make({
      scope,
      entries: [entry({ id: "a", kind: "memory", title: "one\n  two", content: "three\n\nfour" })],
    })
    const text = Overview.format(state)
    expect(text).toContain("one two")
    expect(text).toContain("three four")
  })

  it("shows the entry version, scope, and reference", () => {
    const state = State.make({
      scope,
      entries: [entry({ id: "a", kind: "skill", version: 4, reference: "pkg.run" })],
    })
    expect(Overview.format(state)).toContain(`- a (v4, ${scope}) [pkg.run]:`)
  })

  it("omits an empty content suffix", () => {
    const state = State.make({ scope, entries: [entry({ id: "a", kind: "memory", content: "" })] })
    expect(Overview.format(state)).toContain("- a (v1, thread:alpha): title a")
  })

  it("pins the snapshot identity of the rendered state", () => {
    expect(Overview.format(large)).toContain(State.snapshotId(large))
  })

  it("renders an empty state without any entry lines", () => {
    const text = Overview.format(State.empty(scope))
    expect(text).toContain("prompt: 0")
    expect(text).toContain("recent refinements: 0")
    expect(text.split("\n").filter((line) => line.startsWith("- "))).toEqual([])
  })

  it("treats negative bounds as zero", () => {
    const text = Overview.format(large, { maxEntriesPerKind: -5, maxRefinements: -5 })
    expect(text.split("\n").filter((line) => line.startsWith("- "))).toEqual([])
  })

  it("uses documented defaults when no bounds are given", () => {
    const text = Overview.format(large)
    expect(text.split("\n").filter((line) => line.startsWith("- memory-"))).toHaveLength(
      Overview.defaults.maxEntriesPerKind,
    )
  })
})
