import { Schema } from "effect"
import { DriverOperationKind, ReplayPolicy } from "./driver/contract.js"
import { ControlState } from "../agent/handoff/state.js"
import { Exhausted } from "./run-budget.js"
import { ToolBatchCheckpoint } from "../agent/tools/checkpoint.js"
import { Checkpoint as HookCheckpoint } from "../../hooks/index.js"
import { Checkpoint as GateCheckpoint } from "../agent/gates/definition.js"
import { Items as TaskItems } from "../../tasks/item.js"

/** Pending operation the interpreter schedules before decide. */
export const PendingOperation = Schema.Struct({
  kind: DriverOperationKind,
  key: Schema.String,
  input: Schema.Unknown,
  replayPolicy: ReplayPolicy,
})
export type PendingOperation = typeof PendingOperation.Type

/** Production loop driver state stored in DriverCheckpoint.state. */
export const LoopDriverState = Schema.Struct({
  logicalOperationId: Schema.String,
  sessionId: Schema.String,
  modelCallOrdinal: Schema.Finite,
  modelCallOrdinalStart: Schema.Finite,
  handoff: Schema.optionalKey(ControlState),
  pending: Schema.optionalKey(PendingOperation),
  toolBatch: Schema.optionalKey(ToolBatchCheckpoint),
  tasks: Schema.optionalKey(TaskItems),
  hooks: Schema.optionalKey(Schema.Array(HookCheckpoint)),
  gates: Schema.optionalKey(Schema.Array(GateCheckpoint)),
  postCommitFailure: Schema.optionalKey(Exhausted),
  terminal: Schema.optionalKey(
    Schema.Struct({
      text: Schema.String,
      turns: Schema.Finite,
    }),
  ),
})
export type LoopDriverState = typeof LoopDriverState.Type

/** @internal The active call keeps its scheduled ordinal; safe checkpoints expose the next ordinal. */
export const modelCallOrdinal = (state: LoopDriverState): number => {
  const pending = state.pending
  if (pending?.kind !== "model" && pending?.kind !== "structured-output") return state.modelCallOrdinal
  const input = Schema.decodeUnknownOption(Schema.Struct({ modelCallOrdinal: Schema.Finite }))(pending.input)
  return input._tag === "Some" ? input.value.modelCallOrdinal : state.modelCallOrdinal
}
