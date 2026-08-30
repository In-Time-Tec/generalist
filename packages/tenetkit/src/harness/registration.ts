import type { NamedCapability } from "../core/durable/manifest/agent-manifest.js"
import { digest as pinDigest, makeCapability } from "../core/durable/pin.js"
import { Function } from "effect"
import type { GuidanceSnapshotId } from "./entry.js"
import type { GuidanceState } from "./state.js"
import { CODEC, VERSION, encode, snapshot } from "./snapshot.js"

/** @experimental One named capability and the exact secret-free payload that reconstructs its pinned snapshot. */
export interface PinnedRegistration {
  readonly id: GuidanceSnapshotId
  readonly capability: NamedCapability
  readonly payload: typeof import("./snapshot.js").SnapshotPayload.Encoded
}

/**
 * @experimental Pin one exact guidance state as a named capability of an Agent manifest and the registration payload
 * a durable host must supply for every Execution of that manifest.
 */
export const registration: {
  (name: string): (state: GuidanceState) => PinnedRegistration
  (state: GuidanceState, name: string): PinnedRegistration
} = Function.dual(2, (state: GuidanceState, name: string): PinnedRegistration => {
  const payload = encode(state)
  return {
    id: snapshot(state).id,
    capability: {
      name,
      pin: makeCapability({ codec: CODEC, version: VERSION, payload }),
      content: { codec: CODEC, version: VERSION, digest: pinDigest(payload) },
    },
    payload,
  }
})
