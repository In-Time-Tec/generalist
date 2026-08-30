import { Pins, type AgentManifest } from "../core/index.js"
import { Function } from "effect"
import type { GuidanceSnapshotId } from "./entry.js"
import type { GuidanceState } from "./state.js"
import { codec, version, encode, make as makeSnapshot } from "./snapshot.js"

/** @experimental One named capability and the exact secret-free payload that reconstructs its pinned snapshot. */
export interface PinnedRegistration {
  readonly id: GuidanceSnapshotId
  readonly capability: AgentManifest.NamedCapability
  readonly payload: typeof import("./snapshot.js").SnapshotPayload.Encoded
}

/**
 * @experimental Pin one exact guidance state as a named capability of an Agent manifest and the registration payload
 * a durable host must supply for every Execution of that manifest.
 */
export const make: {
  (name: string): (state: GuidanceState) => PinnedRegistration
  (state: GuidanceState, name: string): PinnedRegistration
} = Function.dual(2, (state: GuidanceState, name: string): PinnedRegistration => {
  const payload = encode(state)
  return {
    id: makeSnapshot(state).id,
    capability: {
      name,
      pin: Pins.makeCapability({ codec, version, payload }),
      content: { codec, version, digest: Pins.digest(payload) },
    },
    payload,
  }
})
