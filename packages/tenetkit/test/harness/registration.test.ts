import { describe, expect, it } from "@effect/vitest"
import { Pins } from "../../src/index.js"
import { Effect, Schema } from "effect"
import { Registration, Snapshot, State } from "../../src/harness/index.js"
import { applied, create, entry, proposal, scope } from "./fixtures.js"

const state = State.make({
  scope,
  entries: [
    entry({ id: "a", kind: "memory" }),
    entry({ id: "b", kind: "skill", reference: "pkg.run" }),
    entry({ id: "c", kind: "subagent" }),
  ],
})

const pinned = Registration.registration(state, "guidance")

describe("Registration", () => {
  it("names the capability the host mounts", () => {
    expect(pinned.capability.name).toBe("guidance")
  })

  it("pins the codec and version the snapshot module owns", () => {
    expect(pinned.capability.content?.codec).toBe(Snapshot.CODEC)
    expect(pinned.capability.content?.version).toBe(Snapshot.VERSION)
  })

  it("pins the exact digest of the registration payload", () => {
    expect(pinned.capability.content?.digest).toBe(Pins.digest(pinned.payload))
  })

  it("carries the content-addressed snapshot identity", () => {
    expect(pinned.id).toBe(State.snapshotId(state))
  })

  it("derives a well-formed capability pin", () => {
    expect(pinned.capability.pin).toMatch(/^capability-pin:v1:sha256:[0-9a-f]{64}$/)
  })

  it("is stable for one exact state", () => {
    expect(Registration.registration(state, "guidance")).toEqual(pinned)
  })

  it("changes the capability pin and digest when the state changes", () => {
    const changed = applied({
      state,
      proposal: proposal({ edits: [create({ kind: "memory", id: "extra" })] }),
    }).state
    const other = Registration.registration(changed, "guidance")
    expect(other.capability.pin).not.toBe(pinned.capability.pin)
    expect(other.capability.content?.digest).not.toBe(pinned.capability.content?.digest)
  })

  it("ignores refinement history in the pinned identity", () => {
    const withHistory = applied({
      state,
      proposal: proposal({ edits: [] }),
    }).state
    expect(Registration.registration(withHistory, "guidance").capability.pin).toBe(pinned.capability.pin)
  })

  it("supports data-last application", () => {
    expect(Registration.registration("guidance")(state)).toEqual(pinned)
  })

  it.effect("reconstructs the exact state from the pinned payload", () =>
    Effect.gen(function* () {
      const payload = yield* Schema.decodeEffect(Snapshot.SnapshotPayload)(pinned.payload)
      const restored = yield* Snapshot.decode(pinned.id, payload)
      expect(State.allEntries(restored)).toEqual(State.allEntries(state))
    }),
  )

  it.effect("fails reconstruction when the pinned payload drifts", () =>
    Effect.gen(function* () {
      const drifted = applied({
        state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "drift" })] }),
      }).state
      const payload = yield* Schema.decodeEffect(Snapshot.SnapshotPayload)(Snapshot.encode(drifted))
      const failure = yield* Snapshot.decode(pinned.id, payload).pipe(Effect.flip)
      expect(failure._tag).toBe("tenetkit/agent-guidance/SnapshotMismatch")
    }),
  )

  it("pins an empty state", () => {
    const empty = Registration.registration(State.empty(scope), "guidance")
    expect(empty.id).toBe(State.snapshotId(State.empty(scope)))
    expect(empty.capability.pin).not.toBe(pinned.capability.pin)
  })
})
