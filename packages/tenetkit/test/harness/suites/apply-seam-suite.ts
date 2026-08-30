import { describe, expect, it } from "@effect/vitest"
import { Brand, Effect, Result, Schema } from "effect"
import { Authorship, Entry, State, Refinement } from "../../../src/harness/index.js"
import { applied, at, entry, proposal, scope, update } from "../fixtures.js"

const seeded = State.make({
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

describe("Refinement.apply accepts only an authored proposal", () => {
  it.effect("mints an authored proposal only through the authorship path", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.author({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "learned", value: { title: "t", content: "c" } }],
      })
      const result = Refinement.apply(State.empty(scope), authored)
      expect(Result.isSuccess(result)).toBe(true)
      if (Result.isFailure(result)) return
      const created = State.findEntry(result.success.state, "memory", "learned")!
      expect(created.version).toBe(1)
      expect(created.createdAt).toBe(at(2))
    }),
  )

  it("statically refuses a bare proposal shape at the authored apply seam", () => {
    const bare: Entry.RefinementProposal = proposal({
      edits: [{ _tag: "Create", kind: "memory", id: "forged", value: { title: "t", content: "c" } }],
    })
    // @ts-expect-error an unbranded proposal is not an authored proposal
    Refinement.apply(State.empty(scope), bare)
    expect(Result.isSuccess(Refinement.applyTrusted(State.empty(scope), bare))).toBe(true)
  })

  it("statically refuses a decoded model payload at the authored apply seam", () => {
    const decoded = Schema.decodeUnknownSync(Entry.RefinementProposal)(forgedJson)
    // @ts-expect-error decoding model JSON as a trusted proposal no longer reaches the authored seam
    Refinement.apply(State.empty(scope), decoded)
    expect(decoded.edits[0]).toMatchObject({ revision: { version: 4242 } })
  })

  it("refuses a forged proposal whose cast erased the brand at runtime", () => {
    const forgeBrand = Brand.nominal<Entry.AuthoredRefinementProposal>()
    const forged = forgeBrand(Schema.decodeUnknownSync(Entry.RefinementProposal)(forgedJson))
    const result = Refinement.apply(State.empty(scope), forged)
    expect(Result.isFailure(result)).toBe(true)
    if (Result.isSuccess(result)) return
    expect(result.failure.reason).toBe("pinned-revision")
    expect(State.findEntry(State.empty(scope), "memory", "forged")).toBeUndefined()
  })

  it("keeps a revision-pinned proposal working on the audited trusted route", () => {
    const pinned = Schema.decodeUnknownSync(Entry.RefinementProposal)(forgedJson)
    const result = Result.getOrThrow(Refinement.applyTrusted(State.empty(scope), pinned))
    expect(State.findEntry(result.state, "memory", "forged")!.version).toBe(4242)
  })

  it.effect("still applies a legitimately authored proposal at runtime", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.author({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "legit", value: { title: "t", content: "c" } }],
      })
      const result = Result.getOrThrow(Refinement.apply(State.empty(scope), authored))
      expect(State.findEntry(result.state, "memory", "legit")!.version).toBe(1)
    }),
  )

  it.effect("refuses the forged payload on the authorship path it must now take", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.author(forgedJson).pipe(Effect.flip)
      if (failure._tag !== "tenetkit/agent-guidance/AuthorshipRejected") throw failure
      expect(failure.reason).toBe("pinned-revision")
      expect(State.findEntry(State.empty(scope), "memory", "forged")).toBeUndefined()
    }),
  )

  it("keeps rollback on the distinctly named trusted route", () => {
    const change = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "memory", id: "target", value: { content: "next" } })] }),
    })
    const inverse = Refinement.makeRollback(change, { id: "rollback-1", at: at(9) })
    // @ts-expect-error a rollback proposal pins a revision, so it is not an authored proposal
    Refinement.apply(change.state, inverse)
    const restored = Result.getOrThrow(Refinement.applyTrusted(change.state, inverse))
    const entryValue = State.findEntry(restored.state, "memory", "target")!
    expect(entryValue.version).toBe(5)
    expect(entryValue.content).toBe("original")
  })

  it.effect("applies an authored proposal exactly as the trusted route applies the same edits", () =>
    Effect.gen(function* () {
      const edits = [
        { _tag: "Create" as const, kind: "memory" as const, id: "same", value: { title: "t", content: "c" } },
      ]
      const authored = yield* Authorship.author({ id: "model-1", at: at(2), edits })
      const viaAuthored = Result.getOrThrow(Refinement.apply(State.empty(scope), authored))
      const viaTrusted = Result.getOrThrow(
        Refinement.applyTrusted(State.empty(scope), proposal({ id: "model-1", at: at(2), edits })),
      )
      expect(viaAuthored.state).toEqual(viaTrusted.state)
      expect(viaAuthored.event).toEqual(viaTrusted.event)
    }),
  )

  it.effect("rejects an authored proposal through the same rejection contract", () =>
    Effect.gen(function* () {
      const authored = yield* Authorship.author({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Create", kind: "memory", id: "target", value: { title: "t", content: "c" } }],
      })
      const result = Refinement.apply(seeded, authored)
      expect(Result.isFailure(result)).toBe(true)
      if (Result.isSuccess(result)) return
      expect(result.failure.reason).toBe("create-existing")
    }),
  )
})
