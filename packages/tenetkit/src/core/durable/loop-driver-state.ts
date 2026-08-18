import { Schema } from "effect"
import { ReplayPolicy } from "./driver-contract.js"
import { WaitDefinition } from "./driver-contract.js"
import { DriverOperationKind } from "./driver-contract.js"
import { HandoffControlState } from "../agent/handoff-state.js"

/** @experimental Pending operation the interpreter schedules before decide. */
export const PendingOperation = Schema.Struct({
  kind: DriverOperationKind,
  key: Schema.String,
  input: Schema.Unknown,
  replayPolicy: ReplayPolicy,
})

/** @experimental */
export type PendingOperation = typeof PendingOperation.Type

/** @experimental Production loop driver state stored in DriverCheckpoint.state. */
export const LoopDriverState = Schema.Struct({
  logicalOperationId: Schema.String,
  sessionId: Schema.String,
  modelCallOrdinal: Schema.Finite,
  modelCallOrdinalStart: Schema.Finite,
  handoff: Schema.optionalKey(HandoffControlState),
  pending: Schema.optionalKey(PendingOperation),
  wait: Schema.optionalKey(WaitDefinition),
  suspensionToken: Schema.optionalKey(Schema.String),
  terminal: Schema.optionalKey(
    Schema.Struct({
      text: Schema.String,
      turns: Schema.Finite,
    }),
  ),
})

/** @experimental */
export type LoopDriverState = typeof LoopDriverState.Type

/** @internal The active call keeps its scheduled ordinal; safe checkpoints expose the next ordinal. */
export const modelCallOrdinal = (state: LoopDriverState): number => {
  const pending = state.pending
  if (pending?.kind !== "model" && pending?.kind !== "structured-output") return state.modelCallOrdinal
  const input = pending.input
  return typeof input === "object" &&
    input !== null &&
    "modelCallOrdinal" in input &&
    typeof input.modelCallOrdinal === "number"
    ? input.modelCallOrdinal
    : state.modelCallOrdinal
}
