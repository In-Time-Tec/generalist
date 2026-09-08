import { Schema } from "effect"
import { Cursor } from "../cursor.js"

export const RetainedSession = Schema.Struct({
  id: Schema.String,
  rootSessionId: Schema.String,
  parentSessionId: Schema.NullOr(Schema.String),
  parentRunId: Schema.NullOr(Schema.String),
  initialRunId: Schema.String,
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type RetainedSession = typeof RetainedSession.Type

/** Omit at on the first page; retain it on every continuation. @experimental */
export const SessionFamilyInput = Schema.Struct({
  at: Schema.optionalKey(Cursor),
  before: Schema.optionalKey(Cursor),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
})
export type SessionFamilyInput = typeof SessionFamilyInput.Type

/** First-admission membership with at most 64 members per 256-event scan. @experimental */
export const SessionFamilyPage = Schema.Struct({
  rootSessionId: Schema.String,
  at: Cursor,
  sessions: Schema.Array(RetainedSession).check(Schema.isMaxLength(64)),
  nextBefore: Schema.NullOr(Cursor),
})
export type SessionFamilyPage = typeof SessionFamilyPage.Type
