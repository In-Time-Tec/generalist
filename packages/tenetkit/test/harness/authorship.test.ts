import { describe, expect, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import { Authorship, Entry, State, Refinement } from "../../src/harness/index.js"
import { applied, at, create, entry, proposal, scope, update } from "./fixtures.js"

const seeded = State.make({
  scope,
  entries: [entry({ id: "target", kind: "memory", version: 5, content: "original" })],
})

const authored = (edits: ReadonlyArray<unknown>) => ({ id: "model-1", at: at(2), edits })

const expectRejected = (failure: Effect.Error<ReturnType<typeof Authorship.authorProposal>>) => {
  expect(failure._tag).toBe("tenetkit/agent-guidance/AuthorshipRejected")
  if (!Schema.is(Authorship.AuthorshipRejected)(failure)) {
    throw new Error("Expected an AuthorshipRejected failure", { cause: failure })
  }
  return failure
}

describe("Authorship.authorProposal", () => {
  it.effect("accepts a well-formed untrusted create", () =>
    Effect.gen(function* () {
      const accepted = yield* Authorship.authorProposal(
        authored([{ _tag: "Create", kind: "memory", id: "learned", value: { title: "t", content: "c" } }]),
      )
      expect(accepted.id).toBe("model-1")
      expect(accepted.edits).toHaveLength(1)
      expect(Authorship.isAuthored(accepted)).toBe(true)
    }),
  )

  it.effect("accepts an untrusted update that pins only baseVersion", () =>
    Effect.gen(function* () {
      const accepted = yield* Authorship.authorProposal(
        authored([
          { _tag: "Update", kind: "memory", id: "target", value: { title: "t", content: "c" }, baseVersion: 5 },
        ]),
      )
      expect(accepted.edits[0]).toMatchObject({ _tag: "Update", baseVersion: 5 })
    }),
  )

  it.effect("accepts an untrusted delete", () =>
    Effect.gen(function* () {
      const accepted = yield* Authorship.authorProposal(
        authored([{ _tag: "Delete", kind: "memory", id: "target", baseVersion: 5 }]),
      )
      expect(accepted.edits[0]).toMatchObject({ _tag: "Delete", id: "target" })
    }),
  )

  it.effect("refuses a create that pins a revision", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(
        authored([
          {
            _tag: "Create",
            kind: "memory",
            id: "forged",
            value: { title: "t", content: "c" },
            revision: { createdAt: at(0), updatedAt: at(0), version: 99 },
          },
        ]),
      ).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("pinned-revision")
    }),
  )

  it.effect("refuses an update that pins a revision", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(
        authored([
          {
            _tag: "Update",
            kind: "memory",
            id: "target",
            value: { title: "t", content: "c" },
            revision: { createdAt: at(0), updatedAt: at(0), version: 1 },
          },
        ]),
      ).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("pinned-revision")
    }),
  )

  it.effect("refuses a revision hidden behind a valid leading edit", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(
        authored([
          { _tag: "Create", kind: "memory", id: "ok", value: { title: "t", content: "c" } },
          {
            _tag: "Update",
            kind: "memory",
            id: "target",
            value: { title: "t", content: "c" },
            revision: { createdAt: at(0), updatedAt: at(0), version: 42 },
          },
        ]),
      ).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("pinned-revision")
    }),
  )

  it.effect("refuses rather than silently dropping the revision", () =>
    Effect.gen(function* () {
      const input = authored([
        {
          _tag: "Create",
          kind: "memory",
          id: "forged",
          value: { title: "t", content: "c" },
          revision: { createdAt: at(0), updatedAt: at(0), version: 99 },
        },
      ])
      const outcome = yield* Effect.result(Authorship.authorProposal(input))
      expect(Result.isFailure(outcome)).toBe(true)
    }),
  )

  it.effect("refuses an undefined revision key as an explicit pin attempt", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(
        authored([
          { _tag: "Create", kind: "memory", id: "x", value: { title: "t", content: "c" }, revision: undefined },
        ]),
      ).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("pinned-revision")
    }),
  )

  it.effect("refuses malformed untrusted input", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal({ id: "model-1" }).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("malformed")
    }),
  )

  it.effect("refuses an unknown edit tag", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(authored([{ _tag: "Replace", kind: "memory", id: "x" }])).pipe(
        Effect.flip,
      )
      expect(expectRejected(failure).reason).toBe("malformed")
    }),
  )

  it.effect("refuses an empty edit list", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal(authored([])).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("malformed")
    }),
  )

  it.effect("refuses an excess proposal property", () =>
    Effect.gen(function* () {
      const failure = yield* Authorship.authorProposal({
        id: "model-1",
        at: at(2),
        edits: [{ _tag: "Delete", kind: "memory", id: "target" }],
        trusted: true,
      }).pipe(Effect.flip)
      expect(expectRejected(failure).reason).toBe("malformed")
    }),
  )

  it.effect("cannot forge an entry's audit trail through an accepted create", () =>
    Effect.gen(function* () {
      const accepted = yield* Authorship.authorProposal(
        authored([{ _tag: "Create", kind: "skill", id: "fresh", value: { title: "t", content: "c" } }]),
      )
      const result = applied({ state: seeded, proposal: accepted })
      const created = State.findEntry(result.state, "skill", "fresh")!
      expect(created.version).toBe(1)
      expect(created.createdAt).toBe(at(2))
      expect(created.updatedAt).toBe(at(2))
    }),
  )

  it.effect("cannot forge an entry's version through an accepted update", () =>
    Effect.gen(function* () {
      const accepted = yield* Authorship.authorProposal(
        authored([{ _tag: "Update", kind: "memory", id: "target", value: { title: "t", content: "next" } }]),
      )
      const result = applied({ state: seeded, proposal: accepted })
      const updated = State.findEntry(result.state, "memory", "target")!
      expect(updated.version).toBe(6)
      expect(updated.createdAt).toBe(at(0))
      expect(updated.updatedAt).toBe(at(2))
    }),
  )

  it.effect("cannot rewrite history by re-creating a deleted entry at its old revision", () =>
    Effect.gen(function* () {
      const removed = applied({
        state: seeded,
        proposal: proposal({ edits: [{ _tag: "Delete", kind: "memory", id: "target" }] }),
      })
      const accepted = yield* Authorship.authorProposal(
        authored([{ _tag: "Create", kind: "memory", id: "target", value: { title: "t", content: "restored" } }]),
      )
      const result = applied({ state: removed.state, proposal: accepted })
      expect(State.findEntry(result.state, "memory", "target")!.version).toBe(1)
    }),
  )

  it("reports a trusted rollback proposal as not authored", () => {
    const change = applied({ state: seeded, proposal: proposal({ edits: [update({ kind: "memory", id: "target" })] }) })
    const inverse = Refinement.rollbackProposal(change, { id: "rollback-1", at: at(9) })
    expect(Authorship.isAuthored(inverse)).toBe(false)
    expect(Refinement.applyTrustedProposal(inverse.edits.length > 0 ? change.state : seeded, inverse)).toBeDefined()
  })

  it("reports a delete-only trusted proposal as authored", () => {
    expect(Authorship.isAuthored(proposal({ edits: [{ _tag: "Delete", kind: "memory", id: "target" }] }))).toBe(true)
  })

  it("keeps the trusted rollback path able to restore an exact revision", () => {
    const change = applied({
      state: seeded,
      proposal: proposal({ edits: [update({ kind: "memory", id: "target", value: { content: "next" } })] }),
    })
    const restored = applied({
      state: change.state,
      proposal: Refinement.rollbackProposal(change, { id: "rollback-1", at: at(9) }),
    })
    const entryValue = State.findEntry(restored.state, "memory", "target")!
    expect(entryValue.version).toBe(5)
    expect(entryValue.content).toBe("original")
  })

  it("keeps revision out of the authored edit contract", () => {
    const forged = {
      _tag: "Create",
      kind: "memory",
      id: "x",
      value: { title: "t", content: "c" },
      revision: { createdAt: at(0), updatedAt: at(0), version: 3 },
    }
    expect(() => Schema.decodeUnknownSync(Entry.AuthoredCreateEdit, { onExcessProperty: "error" })(forged)).toThrow()
    expect(Schema.decodeUnknownSync(Entry.CreateEdit)(forged).revision?.version).toBe(3)
  })

  it("drops a revision that survives lenient decoding of an authored edit", () => {
    const decoded = Schema.decodeUnknownSync(Entry.AuthoredCreateEdit)({
      _tag: "Create",
      kind: "memory",
      id: "x",
      value: { title: "t", content: "c" },
      revision: { createdAt: at(0), updatedAt: at(0), version: 3 },
    })
    expect("revision" in decoded).toBe(false)
  })

  it("statically forbids a revision on an authored edit", () => {
    const authoredHasRevision: "revision" extends keyof Entry.AuthoredCreateEdit ? false : true = true
    const trustedHasRevision: "revision" extends keyof Entry.CreateEdit ? true : false = true
    expect(authoredHasRevision && trustedHasRevision).toBe(true)
  })

  it("accepts every authored proposal as a refinement proposal", () => {
    const value: Entry.RefinementProposal = {
      id: "model-1",
      at: at(2),
      edits: [{ _tag: "Create", kind: "memory", id: "x", value: { title: "t", content: "c" } }],
    }
    expect(Result.isSuccess(Refinement.applyTrustedProposal(State.empty(scope), value))).toBe(true)
    expect(create({ kind: "memory", id: "x" })._tag).toBe("Create")
  })
})
