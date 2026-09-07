import { Cause, Effect, Schema } from "effect"
import { DurabilityFailure } from "../../durability/errors.js"
import type { State } from "../../durability/internal/journal.js"
import { ObjectStoreFailure } from "../../durability/object-store.js"
import { ObjectStoreConformanceFailure } from "./conformance.js"
import type { FailureEvidence } from "./remote-evidence.js"

export type QualificationFailure =
  | Cause.TimeoutError
  | DurabilityFailure
  | ObjectStoreConformanceFailure
  | ObjectStoreFailure

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal assertion with three required direct-style arguments.
export const check = (condition: boolean, name: string, message: string) =>
  condition ? Effect.void : Effect.fail(ObjectStoreConformanceFailure.make({ check: name, message }))

// Never serialize provider messages, endpoint URLs, request headers, credentials, or arbitrary error causes.
export const failureEvidence = (error: QualificationFailure): FailureEvidence => {
  if (Schema.is(ObjectStoreConformanceFailure)(error)) return { tag: error._tag, check: error.check }
  if (Schema.is(ObjectStoreFailure)(error) || Schema.is(DurabilityFailure)(error)) {
    return { tag: error._tag, reason: error.reason }
  }
  return { tag: "unclassified-failure" }
}

const isFiniteNumber = Schema.is(Schema.Finite)

export const increment = (state: State) => {
  const count = isFiniteNumber(state.count) ? state.count + 1 : 1
  return Effect.succeed({ patches: [{ op: "set" as const, path: ["count"], value: count }], receipt: { count } })
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- deterministic byte fixture constructor with two required scalars.
export const payload = (seed: number, size: number) => {
  let state = seed >>> 0
  return Uint8Array.from({ length: size }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state >>> 24
  })
}
