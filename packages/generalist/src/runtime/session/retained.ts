import { Schema } from "effect"

export const RetainedSession = Schema.Struct({
  id: Schema.String,
  rootSessionId: Schema.String,
  parentSessionId: Schema.NullOr(Schema.String),
  parentRunId: Schema.NullOr(Schema.String),
  initialRunId: Schema.String,
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type RetainedSession = typeof RetainedSession.Type
