import { describe, expect, it } from "@effect/vitest"
import { Pins } from "@batonfx/core"
import { Effect } from "effect"
import { HarnessRegistration, HarnessSnapshot, HarnessState } from "../src/index"
import { applied, create, entry, proposal, scope } from "./harness-fixtures"

const state = HarnessState.make({
  scope,
  entries: [
    entry({ id: "a", kind: "memory" }),
    entry({ id: "b", kind: "skill", reference: "pkg.run" }),
    entry({ id: "c", kind: "subagent" }),
  ],
})

const pinned = HarnessRegistration.registration(state, "harness")

describe("HarnessRegistration", () => {
  it("names the capability the host mounts", () => {
    expect(pinned.capability.name).toBe("harness")
  })

  it("pins the codec and version the snapshot module owns", () => {
    expect(pinned.capability.content?.codec).toBe(HarnessSnapshot.CODEC)
    expect(pinned.capability.content?.version).toBe(HarnessSnapshot.VERSION)
  })

  it("pins the exact digest of the registration payload", () => {
    expect(pinned.capability.content?.digest).toBe(Pins.digest(pinned.payload))
  })

  it("carries the content-addressed snapshot identity", () => {
    expect(pinned.id).toBe(HarnessState.snapshotId(state))
  })

  it("derives a well-formed capability pin", () => {
    expect(pinned.capability.pin).toMatch(/^capability-pin:v1:sha256:[0-9a-f]{64}$/)
  })

  it("is stable for one exact state", () => {
    expect(HarnessRegistration.registration(state, "harness")).toEqual(pinned)
  })

  it("changes the capability pin and digest when the state changes", () => {
    const changed = applied({
      state,
      proposal: proposal({ edits: [create({ kind: "memory", id: "extra" })] }),
    }).state
    const other = HarnessRegistration.registration(changed, "harness")
    expect(other.capability.pin).not.toBe(pinned.capability.pin)
    expect(other.capability.content?.digest).not.toBe(pinned.capability.content?.digest)
  })

  it("ignores refinement history in the pinned identity", () => {
    const withHistory = applied({
      state,
      proposal: proposal({ edits: [] }),
    }).state
    expect(HarnessRegistration.registration(withHistory, "harness").capability.pin).toBe(pinned.capability.pin)
  })

  it("supports data-last application", () => {
    expect(HarnessRegistration.registration("harness")(state)).toEqual(pinned)
  })

  it.effect("reconstructs the exact state from the pinned payload", () =>
    Effect.gen(function* () {
      const restored = yield* HarnessSnapshot.decode(pinned.id, pinned.payload)
      expect(HarnessState.allEntries(restored)).toEqual(HarnessState.allEntries(state))
    }),
  )

  it.effect("fails reconstruction when the pinned payload drifts", () =>
    Effect.gen(function* () {
      const drifted = applied({
        state,
        proposal: proposal({ edits: [create({ kind: "memory", id: "drift" })] }),
      }).state
      const failure = yield* HarnessSnapshot.decode(pinned.id, HarnessSnapshot.encode(drifted)).pipe(Effect.flip)
      expect(failure._tag).toBe("@batonfx/harness/SnapshotMismatch")
    }),
  )

  it("pins an empty state", () => {
    const empty = HarnessRegistration.registration(HarnessState.empty(scope), "harness")
    expect(empty.id).toBe(HarnessState.snapshotId(HarnessState.empty(scope)))
    expect(empty.capability.pin).not.toBe(pinned.capability.pin)
  })
})
