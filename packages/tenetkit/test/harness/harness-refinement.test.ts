import { describe, expect, it } from "@effect/vitest"
import { Result, Schema } from "effect"
import { HarnessState, Refinement } from "../../src/harness/index"
import { applied, at, create, entry, proposal, rejected, remove, scope, update } from "./harness-fixtures"

const seeded = HarnessState.make({
  scope,
  entries: [entry({ id: "keep", kind: "memory" }), entry({ id: "target", kind: "skill", version: 3 })],
})

describe("Refinement.applyProposal", () => {
  it("creates one entry at version 1 with the proposal instant", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ edits: [create({ kind: "memory", id: "fresh" })] }),
    })
    const created = HarnessState.findEntry(result.state, "memory", "fresh")!
    expect(created.version).toBe(1)
    expect(created.createdAt).toBe(at(1))
    expect(created.updatedAt).toBe(at(1))
    expect(created.scope).toBe(scope)
    expect(result.event.applied[0]!.before).toBeUndefined()
    expect(result.event.applied[0]!.after).toEqual(created)
  })

  it("bumps the version and keeps createdAt on update", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ at: at(5), edits: [update({ kind: "skill", id: "target", value: { content: "next" } })] }),
    })
    const updated = HarnessState.findEntry(result.state, "skill", "target")!
    expect(updated.version).toBe(4)
    expect(updated.createdAt).toBe(at(0))
    expect(updated.updatedAt).toBe(at(5))
    expect(updated.content).toBe("next")
  })

  it("records the exact before entry on update and delete", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "skill", id: "target" }), remove({ kind: "memory", id: "keep" })] }),
    })
    expect(result.event.applied[0]!.before).toEqual(HarnessState.findEntry(seeded, "skill", "target"))
    expect(result.event.applied[1]!.before).toEqual(HarnessState.findEntry(seeded, "memory", "keep"))
    expect(result.event.applied[1]!.after).toBeUndefined()
  })

  it("increases the version monotonically across repeated updates", () => {
    let state = HarnessState.empty(scope)
    state = applied({
      state: state,
      proposal: proposal({ id: "p0", edits: [create({ kind: "prompt", id: "note" })] }),
    }).state
    const versions: Array<number> = [HarnessState.findEntry(state, "prompt", "note")!.version]
    for (let step = 1; step <= 5; step += 1) {
      state = applied({
        state: state,
        proposal: proposal({
          id: `p${step}`,
          edits: [update({ kind: "prompt", id: "note", value: { content: `v${step}` } })],
        }),
      }).state
      versions.push(HarnessState.findEntry(state, "prompt", "note")!.version)
    }
    expect(versions).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("applies every edit of one proposal in authored order", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({
        edits: [
          create({ kind: "memory", id: "a" }),
          remove({ kind: "memory", id: "keep" }),
          create({ kind: "memory", id: "b" }),
        ],
      }),
    })
    expect(result.state.entries.memory.map((value) => value.id)).toEqual(["a", "b"])
    expect(result.event.applied.map((value) => value.edit._tag)).toEqual(["Create", "Delete", "Create"])
  })

  it("records the before and after snapshots of one refinement", () => {
    const before = HarnessState.snapshotId(seeded)
    const result = applied({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "extra" })] }) })
    expect(result.event.before).toBe(before)
    expect(result.event.after).toBe(HarnessState.snapshotId({ ...result.state, refinements: [] }))
    expect(result.event.after).not.toBe(before)
  })

  it("appends the event to the refinement history", () => {
    const first = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ id: "p1", edits: [create({ kind: "memory", id: "a" })] }),
    })
    const second = applied({
      state: first.state,
      proposal: proposal({ id: "p2", edits: [create({ kind: "memory", id: "b" })] }),
    })
    expect(second.state.refinements.map((event) => event.proposal)).toEqual(["p1", "p2"])
  })

  it("carries the rationale and source into the event", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ edits: [create({ kind: "memory", id: "a" })], rationale: "why", source: "cell" }),
    })
    expect(result.event.rationale).toBe("why")
    expect(result.event.source).toBe("cell")
    expect(result.event.scope).toBe(scope)
  })

  it("omits an absent rationale and source instead of writing undefined", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }),
    })
    expect("rationale" in result.event).toBe(false)
    expect("source" in result.event).toBe(false)
  })

  it("bounds retained refinement history", () => {
    let state = HarnessState.empty(scope)
    for (let step = 0; step < 5; step += 1) {
      state = applied({
        state: state,
        proposal: proposal({ id: `p${step}`, edits: [create({ kind: "memory", id: `m${step}` })] }),
        options: {
          maxRefinements: 2,
        },
      }).state
    }
    expect(state.refinements.map((event) => event.proposal)).toEqual(["p3", "p4"])
  })

  it("drops all history at a zero refinement bound", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ edits: [create({ kind: "memory", id: "a" })] }),
      options: {
        maxRefinements: 0,
      },
    })
    expect(result.state.refinements).toEqual([])
    expect(result.event.proposal).toBe("proposal-1")
  })

  it("accepts a matching baseline snapshot", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({
        edits: [create({ kind: "memory", id: "extra" })],
        baseSnapshot: HarnessState.snapshotId(seeded),
      }),
    })
    expect(HarnessState.findEntry(result.state, "memory", "extra")).toBeDefined()
  })
})

describe("Refinement.applyProposal rejection", () => {
  it("rejects a drifted baseline without changing state", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({
        edits: [create({ kind: "memory", id: "extra" })],
        baseSnapshot: HarnessState.snapshotId(HarnessState.empty(scope)),
      }),
    })
    expect(failure.reason).toBe("baseline-drift")
    expect(failure.proposal).toBe("proposal-1")
    expect(HarnessState.findEntry(seeded, "memory", "extra")).toBeUndefined()
  })

  it("rejects creating an existing entry", () => {
    const failure = rejected({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "keep" })] }) })
    expect(failure.reason).toBe("create-existing")
    expect(failure.target).toBe("memory/keep")
  })

  it("rejects updating a missing entry", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "memory", id: "absent" })] }),
    })
    expect(failure.reason).toBe("update-missing")
    expect(failure.target).toBe("memory/absent")
  })

  it("rejects deleting a missing entry", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({ edits: [remove({ kind: "skill", id: "absent" })] }),
    })
    expect(failure.reason).toBe("delete-missing")
    expect(failure.target).toBe("skill/absent")
  })

  it("rejects an update against a stale base version", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "skill", id: "target", baseVersion: 2 })] }),
    })
    expect(failure.reason).toBe("version-drift")
    expect(failure.message).toContain("3")
  })

  it("rejects a delete against a stale base version", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({ edits: [remove({ kind: "skill", id: "target", baseVersion: 1 })] }),
    })
    expect(failure.reason).toBe("version-drift")
  })

  it("accepts an update against the exact base version", () => {
    const result = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "skill", id: "target", baseVersion: 3 })] }),
    })
    expect(HarnessState.findEntry(result.state, "skill", "target")!.version).toBe(4)
  })

  it("rejects a proposal that edits one target twice", () => {
    const failure = rejected({
      state: seeded,
      proposal: proposal({
        edits: [
          update({ kind: "memory", id: "keep", value: { content: "one" } }),
          update({ kind: "memory", id: "keep", value: { content: "two" } }),
        ],
      }),
    })
    expect(failure.reason).toBe("duplicate-target")
    expect(failure.target).toBe("memory/keep")
  })

  it("permits the same id in two kinds", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({
        edits: [create({ kind: "memory", id: "shared" }), create({ kind: "skill", id: "shared" })],
      }),
    })
    expect(HarnessState.findEntry(result.state, "memory", "shared")).toBeDefined()
    expect(HarnessState.findEntry(result.state, "skill", "shared")).toBeDefined()
  })

  it("rejects a proposal that exceeds the per-kind capacity", () => {
    const failure = rejected({
      state: HarnessState.empty(scope),
      proposal: proposal({
        edits: [
          create({ kind: "memory", id: "a" }),
          create({ kind: "memory", id: "b" }),
          create({ kind: "memory", id: "c" }),
        ],
      }),
      options: { maxEntriesPerKind: 2 },
    })
    expect(failure.reason).toBe("kind-capacity")
    expect(failure.target).toBe("memory")
  })

  it("permits a proposal that stays inside the per-kind capacity", () => {
    const result = applied({
      state: HarnessState.empty(scope),
      proposal: proposal({ edits: [create({ kind: "memory", id: "a" }), create({ kind: "memory", id: "b" })] }),
      options: { maxEntriesPerKind: 2 },
    })
    expect(result.state.entries.memory).toHaveLength(2)
  })

  it("leaves the input state untouched when a later edit fails", () => {
    const before = HarnessState.snapshotId(seeded)
    const failure = rejected({
      state: seeded,
      proposal: proposal({ edits: [create({ kind: "memory", id: "ok" }), update({ kind: "memory", id: "absent" })] }),
    })
    expect(failure.reason).toBe("update-missing")
    expect(HarnessState.snapshotId(seeded)).toBe(before)
    expect(HarnessState.findEntry(seeded, "memory", "ok")).toBeUndefined()
  })

  it("encodes one rejection as a tagged boundary error", () => {
    const failure = rejected({ state: seeded, proposal: proposal({ edits: [create({ kind: "memory", id: "keep" })] }) })
    expect(failure._tag).toBe("tenetkit/harness/RefinementRejected")
    const encoded = Schema.encodeSync(Refinement.RefinementRejected)(failure)
    expect(encoded).toMatchObject({ reason: "create-existing", proposal: "proposal-1", target: "memory/keep" })
  })

  it("returns a failure Result rather than throwing", () => {
    const result = Refinement.applyTrustedProposal(
      seeded,
      proposal({ edits: [create({ kind: "memory", id: "keep" })] }),
    )
    expect(Result.isFailure(result)).toBe(true)
  })
})
