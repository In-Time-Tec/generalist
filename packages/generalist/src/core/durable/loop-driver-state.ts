import { Effect, Function, Schema } from "effect"
import { DriverStateInvalid } from "./service.js"
import { DriverOperationKind, ReplayPolicy } from "./driver/contract.js"
import { ControlState } from "../agent/handoff/state.js"
import { Exhausted } from "./run-budget.js"
import { ToolBatchCheckpoint } from "../agent/tools/checkpoint.js"
import { Checkpoint as HookCheckpoint } from "../../hooks/index.js"
import { Checkpoint as GateCheckpoint } from "../agent/gates/definition.js"
import { Checkpoint as ComponentCheckpoint } from "./component.js"
import { Checkpoint as CapabilityCheckpoint } from "../capability/state.js"
import { ArtifactCheckpoints } from "../artifact.js"

export const RememberInput = Schema.Struct({ turn: Schema.Finite, terminal: Schema.Boolean })

/** Pending operation the interpreter schedules before decide. */
export const PendingOperation = Schema.Struct({
  kind: DriverOperationKind,
  key: Schema.String,
  input: Schema.Unknown,
  replayPolicy: ReplayPolicy,
  completed: Schema.optionalKey(Schema.Literal(true)),
}).check(
  Schema.makeFilter(
    (pending) =>
      pending.completed === undefined ||
      (pending.kind === "memory" && Schema.is(RememberInput)(pending.input)) ||
      "Only completed remember operations are replay cursors",
  ),
)
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
  components: Schema.optionalKey(Schema.Array(ComponentCheckpoint)),
  capabilities: Schema.optionalKey(CapabilityCheckpoint),
  artifacts: Schema.optionalKey(ArtifactCheckpoints),
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

export const encode = Function.flow(
  Schema.encodeEffect(LoopDriverState),
  Effect.mapError((error) => DriverStateInvalid.make({ message: `Invalid loop checkpoint: ${error.message}` })),
)

/** @internal The active call keeps its scheduled ordinal; safe checkpoints expose the next ordinal. */
export const modelCallOrdinal = (state: LoopDriverState): number => {
  const pending = state.pending
  if (pending?.kind !== "model" && pending?.kind !== "structured-output") return state.modelCallOrdinal
  const input = Schema.decodeUnknownOption(Schema.Struct({ modelCallOrdinal: Schema.Finite }))(pending.input)
  return input._tag === "Some" ? input.value.modelCallOrdinal : state.modelCallOrdinal
}
