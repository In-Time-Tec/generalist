import "./suites/store-real-file-system-suite.js"
import "./suites/store-file-system-suite.js"
import "./suites/apply-seam-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { State, Refinement } from "../../src/instructions/index.js"
import { applied, at, create, entry, proposal, rejected, remove, scope, update } from "./fixtures.js"

const seeded = State.make({
  scope,
  entries: [
    entry({ id: "keep", kind: "memory", content: "original" }),
    entry({ id: "target", kind: "skill", version: 3, reference: "pkg.run", arguments: { depth: 2 } }),
    entry({ id: "note", kind: "prompt" }),
  ],
})

const rollback = (result: Refinement.RefinementResult) =>
  Refinement.makeRollback(result, { id: "rollback-1", at: at(9), rationale: "undo", source: "refine" })

const roundTrip = (edits: ReadonlyArray<ReturnType<typeof create>>): void => {
  const before = State.snapshotId(seeded)
  const result = applied({ state: seeded, proposal: proposal({ edits }) })
  const restored = applied({ state: result.state, proposal: rollback(result) })
  expect(State.snapshotId(restored.state)).toBe(before)
  expect(State.allEntries(restored.state)).toEqual(State.allEntries(seeded))
}

describe("Refinement.makeRollback", () => {
  it("restores the exact prior state after a create", () => {
    roundTrip([create({ kind: "memory", id: "added", value: { content: "new" } })])
  })

  it("restores the exact prior state after an update", () => {
    roundTrip([update({ kind: "skill", id: "target", value: { title: "changed", content: "changed" } })])
  })

  it("restores the exact prior state after a delete", () => {
    roundTrip([remove({ kind: "skill", id: "target" })])
  })

  it("restores the exact prior state after a mixed proposal", () => {
    roundTrip([
      create({ kind: "memory", id: "added" }),
      update({ kind: "prompt", id: "note", value: { content: "next" } }),
      remove({ kind: "skill", id: "target" }),
    ])
  })

  it("restores every optional entry field a delete removed", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [remove({ kind: "skill", id: "target" })] }) })
    const restored = applied({ state: result.state, proposal: rollback(result) })
    expect(State.findEntry(restored.state, "skill", "target")).toEqual(State.findEntry(seeded, "skill", "target"))
  })

  it("restores the prior version rather than bumping it", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "skill", id: "target", value: { content: "next" } })] }),
    })
    expect(State.findEntry(result.state, "skill", "target")!.version).toBe(4)
    const restored = applied({ state: result.state, proposal: rollback(result) })
    expect(State.findEntry(restored.state, "skill", "target")!.version).toBe(3)
    expect(State.findEntry(restored.state, "skill", "target")!.updatedAt).toBe(at(0))
  })

  it("inverts the edits in reverse order", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [create({ kind: "memory", id: "a" }), remove({ kind: "prompt", id: "note" })] }),
    })
    const inverse = rollback(result)
    expect(inverse.edits.map((edit) => `${edit._tag}:${edit.kind}/${edit.id}`)).toEqual([
      "Create:prompt/note",
      "Delete:memory/a",
    ])
  })

  it("pins the applied snapshot as its baseline", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }) })
    expect(rollback(result).baseSnapshot).toBe(result.event.after)
    expect(Refinement.rollbackTarget(result)).toBe(result.event.before)
  })

  it("carries its own identity, rationale, and source", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }) })
    const inverse = rollback(result)
    expect(inverse.id).toBe("rollback-1")
    expect(inverse.at).toBe(at(9))
    expect(inverse.rationale).toBe("undo")
    expect(inverse.source).toBe("refine")
  })

  it("omits an absent rationale and source", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }) })
    const inverse = Refinement.makeRollback(result, { id: "rollback-2", at: at(9) })
    expect("rationale" in inverse).toBe(false)
    expect("source" in inverse).toBe(false)
  })

  it("reports that only the newest refinement can be rolled back after state moves on", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }) })
    const moved = applied({
      state: result.state,
      proposal: proposal({ id: "p2", edits: [create({ kind: "memory", id: "b" })] }),
    })
    const failure = rejected({ state: moved.state, proposal: rollback(result) })

    expect(failure.reason).toBe("rollback-not-newest")
    expect(failure.message).toBe("only the newest refinement can be rolled back")
    expect(failure.target).toBe("proposal-1")
  })

  it("rolls back the newest refinement after an older edit recreated its target", () => {
    const removed = applied({
      state: seeded,
      proposal: proposal({ edits: [remove({ kind: "skill", id: "target" })] }),
    })
    const recreated = applied({
      state: removed.state,
      proposal: proposal({ id: "proposal-2", edits: [create({ kind: "skill", id: "target" })] }),
    })
    const restored = applied({ state: recreated.state, proposal: rollback(recreated) })

    expect(State.findEntry(restored.state, "skill", "target")).toBeUndefined()
    expect(rollback(recreated).baseSnapshot).toBe(State.snapshotId(recreated.state))
  })

  it("guards each inverse edit with the version it undoes", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "skill", id: "target", value: { content: "next" } })] }),
    })
    const inverse = rollback(result)
    expect(inverse.edits[0]).toMatchObject({ _tag: "Update", baseVersion: 4 })
  })

  it("keeps the rolled-back refinement in history", () => {
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }) })
    const restored = applied({ state: result.state, proposal: rollback(result) })
    expect(restored.state.refinements.map((event) => event.proposal)).toEqual(["proposal-1", "rollback-1"])
  })

  it("round-trips a rollback of a rollback", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "prompt", id: "note", value: { content: "next" } })] }),
    })
    const restored = applied({ state: result.state, proposal: rollback(result) })
    const redo = applied({
      state: restored.state,
      proposal: Refinement.makeRollback(restored, { id: "rollback-2", at: at(10) }),
    })
    expect(State.allEntries(redo.state)).toEqual(State.allEntries(result.state))
  })
})
