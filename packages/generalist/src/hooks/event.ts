import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** Typed lifecycle boundary exposed to a hook declaration. */
export const Event = Schema.Literals([
  "RunStart",
  "TurnStart",
  "ModelCall",
  "ToolCall",
  "ToolResult",
  "ApprovalRequest",
  "Compaction",
  "ChildStart",
  "ChildEnd",
  "Steer",
  "RunEnd",
])
export type Event = typeof Event.Type

/** A lifecycle hook failed instead of returning a decision. */
export class HookFailed extends ActionableTaggedError<HookFailed>()("generalist/core/HookFailed", {
  event: Event,
  cause: Schema.Defect(),
  hint: errorHint("Inspect the named lifecycle hook and its cause before retrying the run."),
}) {}

/** A lifecycle checkpoint could not be loaded or persisted. */
export class LifecyclePersistenceFailed extends ActionableTaggedError<LifecyclePersistenceFailed>()(
  "generalist/lifecycle/LifecyclePersistenceFailed",
  {
    operationKey: Schema.String,
    stage: Schema.Literals(["load", "record", "complete"]),
    message: Schema.String,
  },
) {}

/** A stored lifecycle checkpoint is incompatible with the registered hook chain. */
export class CheckpointInvalid extends ActionableTaggedError<CheckpointInvalid>()(
  "generalist/lifecycle/CheckpointInvalid",
  {
    checkpointKey: Schema.String,
    event: Schema.optionalKey(Event),
    message: Schema.String,
  },
) {}

/** A never-replay lifecycle operation has no authoritative recorded outcome. */
export class ReplayUnresolved extends ActionableTaggedError<ReplayUnresolved>()(
  "generalist/lifecycle/ReplayUnresolved",
  {
    operationKey: Schema.String,
    replayKey: Schema.String,
    message: Schema.String,
  },
) {}
