import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

/** A same-run handoff rejected before its target became active. */
export class Rejected extends ActionableTaggedError<Rejected>()("generalist/core/HandoffRejected", {
  handoffId: Schema.String,
  turn: Schema.Finite,
  reason: Schema.String,
  hint: errorHint("Use the reason to revise the requested handoff or continue with the current Agent."),
}) {}
