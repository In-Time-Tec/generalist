import { Schema } from "effect"

/** @experimental A same-run handoff rejected before its target became active. */
export class Rejected extends Schema.TaggedError<Rejected>()("tenetkit/core/HandoffRejected", {
  handoffId: Schema.String,
  turn: Schema.Finite,
  reason: Schema.String,
}) {}
