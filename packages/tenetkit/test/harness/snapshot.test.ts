import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Snapshot, State } from "../../src/harness/index.js"
import { applied, create, entry, proposal, scope } from "./fixtures.js"

const state = State.make({
  scope,
  entries: [
    entry({ id: "a", kind: "memory", metadata: { pinned: true }, arguments: { limit: 3 } }),
    entry({ id: "b", kind: "skill", reference: "pkg.run", path: "skills/b/SKILL.md", version: 4 }),
    entry({ id: "c", kind: "subagent", source: "cell" }),
  ],
})

const snapshot = Snapshot.make(state)
const malformedVersion = Schema.decodeSync(Schema.Unknown)({ schemaVersion: "2" })
const encode = (value: State.GuidanceState): Snapshot.SnapshotPayload =>
  Schema.decodeSync(Snapshot.SnapshotPayload)(Snapshot.encode(value))
const malformedEntry = Schema.decodeSync(Schema.Unknown)({
  ...snapshot.payload,
  entries: [{ ...snapshot.payload.entries[0]!, version: 0 }],
})

describe("Snapshot", () => {
  it("pins the content-addressed identity of one state", () => {
    expect(snapshot.id).toBe(State.snapshotId(state))
    expect(snapshot.id).toMatch(/^guidance-snapshot:v1:sha256:[0-9a-f]{64}$/)
  })

  it("carries every entry in canonical order", () => {
    expect(snapshot.payload.entries.map((value) => value.id)).toEqual(["a", "b", "c"])
    expect(snapshot.payload.scope).toBe(scope)
    expect(snapshot.payload.schemaVersion).toBe("1")
  })

  it("excludes refinement history from the pinned payload", () => {
    const withHistory = applied({
      state,
      proposal: proposal({ edits: [create({ kind: "memory", id: "later" })] }),
    }).state
    const pinned = Snapshot.make(withHistory)
    expect(pinned.payload).not.toHaveProperty("refinements")
    expect(pinned.id).toBe(State.snapshotId(withHistory))
  })

  it.effect("reconstructs the exact state from its registration payload", () =>
    Effect.gen(function* () {
      const restored = yield* Snapshot.decode(snapshot.id, Snapshot.encode(state))
      expect(State.allEntries(restored)).toEqual(State.allEntries(state))
      expect(State.snapshotId(restored)).toBe(snapshot.id)
      expect(restored.scope).toBe(scope)
    }),
  )

  it.effect("reconstructs an empty state", () =>
    Effect.gen(function* () {
      const empty = State.empty(scope)
      const restored = yield* Snapshot.decode(State.snapshotId(empty), Snapshot.encode(empty))
      expect(State.allEntries(restored)).toEqual([])
    }),
  )

  it.effect("reconstructs a state with dropped refinement history as an empty history", () =>
    Effect.gen(function* () {
      const withHistory = applied({
        state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "later" })] }),
      }).state
      const restored = yield* Snapshot.decode(State.snapshotId(withHistory), Snapshot.encode(withHistory))
      expect(restored.refinements).toEqual([])
      expect(State.snapshotId(restored)).toBe(State.snapshotId(withHistory))
    }),
  )

  it.effect("fails when the payload does not reconstruct the pinned snapshot", () =>
    Effect.gen(function* () {
      const changed = applied({
        state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "extra" })] }),
      }).state
      const failure = yield* Snapshot.decode(snapshot.id, Snapshot.encode(changed)).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/agent-guidance/SnapshotMismatch")
      if (failure._tag !== "tenetkit/agent-guidance/SnapshotMismatch") return
      expect(failure.expected).toBe(snapshot.id)
      expect(failure.actual).toBe(State.snapshotId(changed))
    }),
  )

  it.effect("fails on a payload that is not a guidance state", () =>
    Effect.gen(function* () {
      const failure = yield* Schema.decodeUnknownEffect(Snapshot.SnapshotPayload)(malformedVersion).pipe(
        Effect.flatMap((payload) => Snapshot.decode(snapshot.id, payload)),
        Effect.mapError((error) => Snapshot.SnapshotInvalid.make({ message: String(error) })),
        Effect.flip,
      )
      expect(failure._tag).toBe("tenetkit/agent-guidance/SnapshotInvalid")
    }),
  )

  it.effect("fails on an excess property in the payload", () =>
    Effect.gen(function* () {
      const payload = { ...encode(state), extra: 1 }
      const failure = yield* Snapshot.decode(snapshot.id, payload).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/agent-guidance/SnapshotInvalid")
    }),
  )

  it.effect("fails on an out-of-contract entry in the payload", () =>
    Effect.gen(function* () {
      const failure = yield* Schema.decodeUnknownEffect(Snapshot.SnapshotPayload)(malformedEntry).pipe(
        Effect.flatMap((decoded) => Snapshot.decode(snapshot.id, decoded)),
        Effect.mapError((error) => Snapshot.SnapshotInvalid.make({ message: String(error) })),
        Effect.flip,
      )
      expect(failure._tag).toBe("tenetkit/agent-guidance/SnapshotInvalid")
    }),
  )

  it.effect("survives a JSON round trip of the registration payload", () => {
    const wire = Schema.decodeSync(Schema.fromJsonString(Schema.Unknown))(
      Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(Snapshot.encode(state)),
    )
    return Schema.decodeUnknownEffect(Snapshot.SnapshotPayload)(wire).pipe(
      Effect.flatMap((payload) => Snapshot.decode(snapshot.id, payload)),
      Effect.map((restored) => {
        expect(State.allEntries(restored)).toEqual(State.allEntries(state))
      }),
    )
  })

  it.effect("reconstructs the same state from entries in any payload order", () =>
    Effect.gen(function* () {
      const payload = encode(state)
      const restored = yield* Snapshot.decode(snapshot.id, {
        ...payload,
        entries: payload.entries.toReversed(),
      })
      expect(State.allEntries(restored)).toEqual(State.allEntries(state))
    }),
  )

  it("names a stable codec and version for durable registrations", () => {
    expect(Snapshot.CODEC).toBe("tenetkit/agent-guidance/snapshot")
    expect(Snapshot.VERSION).toBe("1")
  })

  it("round-trips its snapshot schema", () => {
    const encoded = Schema.encodeSync(Snapshot.GuidanceSnapshot)(snapshot)
    expect(Schema.decodeSync(Snapshot.GuidanceSnapshot)(encoded)).toEqual(snapshot)
  })

  it("rejects a malformed snapshot identity", () => {
    expect(() => Schema.decodeSync(Snapshot.GuidanceSnapshot)({ id: "nope", payload: snapshot.payload })).toThrow()
  })
})
