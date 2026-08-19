import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HarnessSnapshot, HarnessState } from "../../src/harness/index"
import { applied, create, entry, proposal, scope } from "./harness-fixtures"

const state = HarnessState.make({
  scope,
  entries: [
    entry({ id: "a", kind: "memory", metadata: { pinned: true }, arguments: { limit: 3 } }),
    entry({ id: "b", kind: "skill", reference: "pkg.run", path: "skills/b/SKILL.md", version: 4 }),
    entry({ id: "c", kind: "subagent", source: "cell" }),
  ],
})

const snapshot = HarnessSnapshot.snapshot(state)

describe("HarnessSnapshot", () => {
  it("pins the content-addressed identity of one state", () => {
    expect(snapshot.id).toBe(HarnessState.snapshotId(state))
    expect(snapshot.id).toMatch(/^harness-snapshot:v1:sha256:[0-9a-f]{64}$/)
  })

  it("carries every entry in canonical order", () => {
    expect(snapshot.payload.entries.map((value) => value.id)).toEqual(["a", "b", "c"])
    expect(snapshot.payload.scope).toBe(scope)
    expect(snapshot.payload.schemaVersion).toBe("1")
  })

  it("excludes refinement history from the pinned payload", () => {
    const withHistory = applied({
      state: state,
      proposal: proposal({ edits: [create({ kind: "memory", id: "later" })] }),
    }).state
    const pinned = HarnessSnapshot.snapshot(withHistory)
    expect(pinned.payload).not.toHaveProperty("refinements")
    expect(pinned.id).toBe(HarnessState.snapshotId(withHistory))
  })

  it.effect("reconstructs the exact state from its registration payload", () =>
    Effect.gen(function* () {
      const restored = yield* HarnessSnapshot.decode(snapshot.id, HarnessSnapshot.encode(state))
      expect(HarnessState.allEntries(restored)).toEqual(HarnessState.allEntries(state))
      expect(HarnessState.snapshotId(restored)).toBe(snapshot.id)
      expect(restored.scope).toBe(scope)
    }),
  )

  it.effect("reconstructs an empty state", () =>
    Effect.gen(function* () {
      const empty = HarnessState.empty(scope)
      const restored = yield* HarnessSnapshot.decode(HarnessState.snapshotId(empty), HarnessSnapshot.encode(empty))
      expect(HarnessState.allEntries(restored)).toEqual([])
    }),
  )

  it.effect("reconstructs a state with dropped refinement history as an empty history", () =>
    Effect.gen(function* () {
      const withHistory = applied({
        state: state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "later" })] }),
      }).state
      const restored = yield* HarnessSnapshot.decode(
        HarnessState.snapshotId(withHistory),
        HarnessSnapshot.encode(withHistory),
      )
      expect(restored.refinements).toEqual([])
      expect(HarnessState.snapshotId(restored)).toBe(HarnessState.snapshotId(withHistory))
    }),
  )

  it.effect("fails when the payload does not reconstruct the pinned snapshot", () =>
    Effect.gen(function* () {
      const changed = applied({
        state: state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "extra" })] }),
      }).state
      const failure = yield* HarnessSnapshot.decode(snapshot.id, HarnessSnapshot.encode(changed)).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/harness/SnapshotMismatch")
      if (failure._tag !== "tenetkit/harness/SnapshotMismatch") return
      expect(failure.expected).toBe(snapshot.id)
      expect(failure.actual).toBe(HarnessState.snapshotId(changed))
    }),
  )

  it.effect("fails on a payload that is not a harness state", () =>
    Effect.gen(function* () {
      const failure = yield* HarnessSnapshot.decode(snapshot.id, { schemaVersion: "2" }).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/harness/SnapshotInvalid")
    }),
  )

  it.effect("fails on an excess property in the payload", () =>
    Effect.gen(function* () {
      const payload = { ...(HarnessSnapshot.encode(state) as Record<string, unknown>), extra: 1 }
      const failure = yield* HarnessSnapshot.decode(snapshot.id, payload).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/harness/SnapshotInvalid")
    }),
  )

  it.effect("fails on an out-of-contract entry in the payload", () =>
    Effect.gen(function* () {
      const payload = HarnessSnapshot.encode(state) as { entries: Array<Record<string, unknown>> }
      const failure = yield* HarnessSnapshot.decode(snapshot.id, {
        ...payload,
        entries: [{ ...payload.entries[0]!, version: 0 }],
      }).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/harness/SnapshotInvalid")
    }),
  )

  it.effect("survives a JSON round trip of the registration payload", () => {
    const wire = Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Unknown))(
      Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(HarnessSnapshot.encode(state)),
    )
    return HarnessSnapshot.decode(snapshot.id, wire).pipe(
      Effect.map((restored) => {
        expect(HarnessState.allEntries(restored)).toEqual(HarnessState.allEntries(state))
      }),
    )
  })

  it.effect("reconstructs the same state from entries in any payload order", () =>
    Effect.gen(function* () {
      const payload = HarnessSnapshot.encode(state) as { entries: Array<unknown> }
      const restored = yield* HarnessSnapshot.decode(snapshot.id, {
        ...payload,
        entries: payload.entries.toReversed(),
      })
      expect(HarnessState.allEntries(restored)).toEqual(HarnessState.allEntries(state))
    }),
  )

  it("names a stable codec and version for durable registrations", () => {
    expect(HarnessSnapshot.CODEC).toBe("tenetkit/harness/snapshot")
    expect(HarnessSnapshot.VERSION).toBe("1")
  })

  it("round-trips its snapshot schema", () => {
    const encoded = Schema.encodeSync(HarnessSnapshot.HarnessSnapshot)(snapshot)
    expect(Schema.decodeUnknownSync(HarnessSnapshot.HarnessSnapshot)(encoded)).toEqual(snapshot)
  })

  it("rejects a malformed snapshot identity", () => {
    expect(() =>
      Schema.decodeUnknownSync(HarnessSnapshot.HarnessSnapshot)({ id: "nope", payload: snapshot.payload }),
    ).toThrow()
  })
})
