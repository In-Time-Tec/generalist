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
