import { Schema, type Effect, type Stream } from "effect"
import type { DurabilityFailure } from "../../durability/errors.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { Cursor } from "../cursor.js"
import type { RuntimeUnavailable } from "../errors.js"
import type { RunInspection } from "../run.js"
import { RunEvent } from "../run/event.js"
import { Conversation, ConversationUpdate } from "./conversation.js"
import { PendingInput, SessionSelection } from "./queue.js"
import {
  SessionHistoryPage,
  SessionRunsPage,
  SessionPageInvalid,
  type SessionHistoryInput,
  type SessionRunsInput,
  SessionRunSummary,
} from "./page.js"

/** Durable product-facing Session metadata owned by a Runtime driver. */
export interface HostSession {
  readonly id: string
  readonly title?: string
  readonly createdAt: string
  readonly selection?: SessionSelection
  readonly queue: ReadonlyArray<PendingInput>
  readonly activeRunId?: string
}
export const HostSession: Schema.Codec<HostSession, unknown> = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
  selection: Schema.optionalKey(SessionSelection),
  queue: Schema.Array(PendingInput),
  activeRunId: Schema.optionalKey(Schema.String),
})

/** One bounded committed Session projection and its exact exclusive replay cursor. @experimental */
export interface HostSessionSnapshot {
  readonly version: 1
  readonly session: HostSession
  readonly cursor: Cursor
  readonly runs: ReadonlyArray<SessionRunSummary>
  readonly conversation: Conversation
}
export const HostSessionSnapshot: Schema.Codec<HostSessionSnapshot, unknown> = Schema.Struct({
  version: Schema.Literal(1),
  session: HostSession,
  cursor: Cursor,
  runs: Schema.Array(SessionRunSummary).check(Schema.isMaxLength(33)),
  conversation: Conversation,
})

export type SessionSnapshotError = SessionError | SessionPageInvalid
export type SessionPageError = SessionError | SessionPageInvalid

/** One Runtime event at its exclusive Session replay cursor. */
export const HostSessionEvent = Schema.Union([
  Schema.TaggedStruct("Run", { cursor: Cursor, event: RunEvent }),
  Schema.TaggedStruct("Conversation", { cursor: Cursor, update: ConversationUpdate }),
])
export type HostSessionEvent = typeof HostSessionEvent.Type

export interface CreateSessionInput {
  readonly id: string
  readonly title?: string
  readonly selection?: SessionSelection
}

export interface SessionEventsInput {
  readonly sessionId: string
  readonly cursor?: Cursor
}

/** A requested host Session does not exist. */
export class SessionNotFound extends ActionableTaggedError<SessionNotFound>()("generalist/host/SessionNotFound", {
  sessionId: Schema.String,
  hint: errorHint("Create the Session through host.sessions.create before starting or observing Runs."),
}) {}

/** A host Session already owns the requested identity. */
export class SessionConflict extends ActionableTaggedError<SessionConflict>()("generalist/host/SessionConflict", {
  sessionId: Schema.String,
  hint: errorHint("Use a different Session identity or load the existing Session."),
}) {}

/** A Session replay cursor is outside the driver's retained event range. */
export class SessionCursorExpired extends ActionableTaggedError<SessionCursorExpired>()(
  "generalist/host/SessionCursorExpired",
  {
    sessionId: Schema.String,
    cursor: Schema.Int,
    earliestCursor: Schema.Int,
    latestCursor: Schema.Int,
    hint: errorHint("Restart replay from the earliest available Session cursor."),
  },
) {}

/** A Session event subscriber could not keep up with its bounded live queue. */
export class SessionSubscriberLagged extends ActionableTaggedError<SessionSubscriberLagged>()(
  "generalist/host/SessionSubscriberLagged",
  {
    sessionId: Schema.String,
    lastDeliveredCursor: Schema.Int,
    hint: errorHint("Resume the Session event stream from the last delivered cursor."),
  },
) {}

export type SessionError = SessionNotFound | RuntimeUnavailable | DurabilityFailure
export type CreateSessionError = SessionConflict | RuntimeUnavailable | DurabilityFailure
export type SessionEventsError =
  | SessionNotFound
  | SessionCursorExpired
  | SessionSubscriberLagged
  | RuntimeUnavailable
  | DurabilityFailure

/** Runtime operations that persist and observe product-facing Sessions. */
export interface RuntimeHostSessions {
  readonly submitSessionInput: import("../run/store.js").Service["submitSessionInput"]
  readonly updateSessionInput: import("../run/store.js").Service["updateSessionInput"]
  readonly removeSessionInput: import("../run/store.js").Service["removeSessionInput"]
  readonly createSession: (input: CreateSessionInput) => Effect.Effect<HostSession, CreateSessionError>
  readonly session: (sessionId: string) => Effect.Effect<HostSession, SessionError>
  readonly sessionSnapshot: (sessionId: string) => Effect.Effect<HostSessionSnapshot, SessionSnapshotError>
  readonly sessionHistoryPage: (
    sessionId: string,
    input: SessionHistoryInput,
  ) => Effect.Effect<SessionHistoryPage, SessionPageError>
  readonly sessionRunsPage: (
    sessionId: string,
    input: SessionRunsInput,
  ) => Effect.Effect<SessionRunsPage, SessionPageError>
  readonly sessionRunSummary: (sessionId: string, runId: string) => Effect.Effect<SessionRunSummary, SessionPageError>
  readonly listSessions: Effect.Effect<ReadonlyArray<HostSession>, RuntimeUnavailable | DurabilityFailure>
  readonly sessionRuns: (sessionId: string) => Effect.Effect<ReadonlyArray<RunInspection>, SessionError>
  readonly sessionEvents: (input: SessionEventsInput) => Stream.Stream<HostSessionEvent, SessionEventsError>
}
