import { describe, expect, it } from "@effect/vitest"
import { Brand, Effect, Result, Schema } from "effect"
import { Authorship, HarnessEntry, HarnessState, Refinement } from "../../../src/harness/index.js"
import { applied, at, entry, proposal, scope, update } from "../fixtures.js"

const seeded = HarnessState.make({
  scope,
  entries: [entry({ id: "target", kind: "memory", version: 5, content: "original" })],
})

const forgedJson = {
  id: "model-1",
  at: at(2),
  edits: [
    {
      _tag: "Create",
      kind: "memory",
      id: "forged",
      value: { title: "t", content: "c" },
      revision: { createdAt: "1999-01-01T00:00:00.000Z", updatedAt: "1999-01-01T00:00:00.000Z", version: 4242 },
    },
  ],
}

describe("Refinement.applyProposal accepts only an authored proposal", () => {
  it.effect("mints an authored proposal only through the authorship path", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.authorProposal({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "learned", value: { title: "t", content: "c" } }],
      })
      const result = Refinement.applyProposal(HarnessState.empty(scope), authored)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isFailure(result)) return
      const created = HarnessState.findEntry(result.success.state, "memory", "learned")!
      expect(created.version).toBe(1)
      expect(created.createdAt).toBe(at(2))
    }),
  )

  it("statically refuses a bare proposal shape at the authored apply seam", () => {
    const bare: HarnessEntry.RefinementProposal = proposal({
      edits: [{ _tag: "Create", kind: "memory", id: "forged", value: { title: "t", content: "c" } }],
    })
    // @ts-expect-error an unbranded proposal is not an authored proposal
    Refinement.applyProposal(HarnessState.empty(scope), bare)
    expect(Result.isSuccess(Refinement.applyTrustedProposal(HarnessState.empty(scope), bare))).toBe(true)
  })

  it("statically refuses a decoded model payload at the authored apply seam", () => {
    const decoded = Schema.decodeUnknownSync(HarnessEntry.RefinementProposal)(forgedJson)
    // @ts-expect-error decoding model JSON as a trusted proposal no longer reaches the authored seam
    Refinement.applyProposal(HarnessState.empty(scope), decoded)
    expect(decoded.edits[0]).toMatchObject({ revision: { version: 4242 } })
  })

  it("refuses a forged proposal whose cast erased the brand at runtime", () => {
    const forgeBrand = Brand.nominal<HarnessEntry.AuthoredRefinementProposal>()
    const forged = forgeBrand(Schema.decodeUnknownSync(HarnessEntry.RefinementProposal)(forgedJson))
    const result = Refinement.applyProposal(HarnessState.empty(scope), forged)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) return
    expect(result.failure.reason).toBe("pinned-revision")
    expect(HarnessState.findEntry(HarnessState.empty(scope), "memory", "forged")).toBeUndefined()
  })

  it("keeps a revision-pinned proposal working on the audited trusted route", () => {
    const pinned = Schema.decodeUnknownSync(HarnessEntry.RefinementProposal)(forgedJson)
    const result = Result.getOrThrow(Refinement.applyTrustedProposal(HarnessState.empty(scope), pinned))
    expect(HarnessState.findEntry(result.state, "memory", "forged")!.version).toBe(4242)
  })

  it.effect("still applies a legitimately authored proposal at runtime", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.authorProposal({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "legit", value: { title: "t", content: "c" } }],
      })
      const result = Result.getOrThrow(Refinement.applyProposal(HarnessState.empty(scope), authored))
      expect(HarnessState.findEntry(result.state, "memory", "legit")!.version).toBe(1)
    }),
  )

  it.effect("refuses the forged payload on the authorship path it must now take", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(forgedJson).pipe(Effect.flip)
      if (failure._tag !== "tenetkit/harness/AuthorshipRejected") throw failure
      expect(failure.reason).toBe("pinned-revision")
      expect(HarnessState.findEntry(HarnessState.empty(scope), "memory", "forged")).toBeUndefined()
    }),
  )

  it("keeps rollback on the distinctly named trusted route", () => {
    const change = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "memory", id: "target", value: { content: "next" } })] }),
    })
    const inverse = Refinement.rollbackProposal(change, { id: "rollback-1", at: at(9) })
    // @ts-expect-error a rollback proposal pins a revision, so it is not an authored proposal
    Refinement.applyProposal(change.state, inverse)
    const restored = Result.getOrThrow(Refinement.applyTrustedProposal(change.state, inverse))
    const entryValue = HarnessState.findEntry(restored.state, "memory", "target")!
    expect(entryValue.version).toBe(5)
    expect(entryValue.content).toBe("original")
  })

  it.effect("applies an authored proposal exactly as the trusted route applies the same edits", () =>
    Effect.gen(function* () {
      const edits = [
        { _tag: "Create" as const, kind: "memory" as const, id: "same", value: { title: "t", content: "c" } },
      ]
      const authored = yield* Authorship.authorProposal({ id: "model-1", at: at(2), edits })
      const viaAuthored = Result.getOrThrow(Refinement.applyProposal(HarnessState.empty(scope), authored))
      const viaTrusted = Result.getOrThrow(
        Refinement.applyTrustedProposal(HarnessState.empty(scope), proposal({ id: "model-1", at: at(2), edits })),
      )
      expect(viaAuthored.state).toEqual(viaTrusted.state)
      expect(viaAuthored.event).toEqual(viaTrusted.event)
    }),
  )

  it.effect("rejects an authored proposal through the same rejection contract", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.authorProposal({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "target", value: { title: "t", content: "c" } }],
      })
      const result = Refinement.applyProposal(seeded, authored)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isSuccess(result)) return
      expect(result.failure.reason).toBe("create-existing")
    }),
  )
})
