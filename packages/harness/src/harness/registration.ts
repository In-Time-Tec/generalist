import { Pins, type AgentManifest } from "@batonfx/core"
import { Function } from "effect"
import type { HarnessSnapshotId } from "./entry.js"
import type { HarnessState } from "./state.js"
import { CODEC, VERSION, encode, snapshot } from "./snapshot.js"

/** @experimental One named capability and the exact secret-free payload that reconstructs its pinned snapshot. */
export interface PinnedRegistration {
  readonly id: HarnessSnapshotId
  readonly capability: AgentManifest.NamedCapability
  readonly payload: unknown
}

/**
 * @experimental Pin one exact harness state as a named capability of an Agent manifest and the registration payload
 * a durable host must supply for every Execution of that manifest.
 */
export const registration: {
  (name: string): (state: HarnessState) => PinnedRegistration
  (state: HarnessState, name: string): PinnedRegistration
} = Function.dual(2, (state: HarnessState, name: string): PinnedRegistration => {
  const payload = encode(state)
  return {
    id: snapshot(state).id,
    capability: {
      name,
      pin: Pins.makeCapability({ codec: CODEC, version: VERSION, payload }),
      content: { codec: CODEC, version: VERSION, digest: Pins.digest(payload) },
    },
    payload,
  }
})
