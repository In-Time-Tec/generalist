import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { Cursor } from "../cursor.js"
import { RunStatus } from "../run.js"
import { Request as ApprovalRequest } from "../operation/approval.js"
import { ConversationEntry } from "./conversation.js"

/** A bounded selector over one immutable conversation path. @experimental */
export const SessionHistoryInput = Schema.Struct({
  leafId: Schema.NullOr(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024))),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
})
export type SessionHistoryInput = typeof SessionHistoryInput.Type

/** Follow nextLeafId until null; pages contain chronological entries. @experimental */
export interface SessionHistoryPage {
  readonly leafId: string | null
  readonly entries: ReadonlyArray<ConversationEntry>
  readonly nextLeafId: string | null
}
export const SessionHistoryPage: Schema.Codec<SessionHistoryPage, unknown> = Schema.Struct({
  leafId: Schema.NullOr(Schema.String),
  entries: Schema.Array(ConversationEntry).check(Schema.isMaxLength(64)),
  nextLeafId: Schema.NullOr(Schema.String),
})

/** Run metadata without retained manifests, results, or event history. @experimental */
export interface SessionRunSummary {
  readonly runId: string
  readonly rootRunId: string
  readonly parentRunId?: string
  readonly status: RunStatus
  readonly cursor: Cursor
  readonly turn: number
  readonly approval?: ApprovalRequest
}
export const SessionRunSummary: Schema.Codec<SessionRunSummary, unknown> = Schema.Struct({
  runId: Schema.String,
  rootRunId: Schema.String,
  parentRunId: Schema.optionalKey(Schema.String),
  status: RunStatus,
  cursor: Cursor,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  approval: Schema.optionalKey(ApprovalRequest),
})

/** Membership is pinned to at; summaries report current committed status. @experimental */
export const SessionRunsInput = Schema.Struct({
  at: Cursor,
  before: Schema.optionalKey(Cursor),
  rootRunId: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(1024))),
  limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 64 })),
})
export type SessionRunsInput = typeof SessionRunsInput.Type

/** Scan at most 256 events, including empty filtered pages with a continuation. @experimental */
export interface SessionRunsPage {
  readonly at: Cursor
  readonly runs: ReadonlyArray<SessionRunSummary>
  readonly nextBefore: Cursor | null
}
export const SessionRunsPage: Schema.Codec<SessionRunsPage, unknown> = Schema.Struct({
  at: Cursor,
  runs: Schema.Array(SessionRunSummary).check(Schema.isMaxLength(64)),
  nextBefore: Schema.NullOr(Cursor),
})

/** A page selector does not name retained evidence in the authorized Session. @experimental */
export class SessionPageInvalid extends ActionableTaggedError<SessionPageInvalid>()(
  "generalist/host/SessionPageInvalid",
  {
    sessionId: Schema.String,
    hint: errorHint("Use the leaf or continuation returned by this Session's snapshot or previous page."),
  },
) {}
