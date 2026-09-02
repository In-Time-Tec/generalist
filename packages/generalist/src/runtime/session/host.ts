import { Schema, type Effect, type Stream } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import type { Cursor } from "../cursor.js"
import type { RuntimeUnavailable } from "../errors.js"
import type { RunInspection } from "../run.js"
import type { RunEvent } from "../run/event.js"

/** Durable product-facing Session metadata owned by a Runtime driver. */
export const HostSession = Schema.Struct({
  id: Schema.String.check(Schema.isNonEmpty()),
  title: Schema.optionalKey(Schema.String),
  createdAt: Schema.String,
})
export type HostSession = typeof HostSession.Type

/** One Runtime event at its exclusive Session replay cursor. */
export interface HostSessionEvent {
  readonly cursor: Cursor
  readonly event: RunEvent
}

export interface CreateSessionInput {
  readonly id: string
  readonly title?: string
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

export type SessionError = SessionNotFound | RuntimeUnavailable
export type CreateSessionError = SessionConflict | RuntimeUnavailable
export type SessionEventsError = SessionNotFound | SessionCursorExpired | SessionSubscriberLagged | RuntimeUnavailable

/** Runtime operations that persist and observe product-facing Sessions. */
export interface RuntimeHostSessions {
  readonly createSession: (input: CreateSessionInput) => Effect.Effect<HostSession, CreateSessionError>
  readonly session: (sessionId: string) => Effect.Effect<HostSession, SessionError>
  readonly listSessions: Effect.Effect<ReadonlyArray<HostSession>, RuntimeUnavailable>
  readonly sessionRuns: (sessionId: string) => Effect.Effect<ReadonlyArray<RunInspection>, SessionError>
  readonly sessionEvents: (input: SessionEventsInput) => Stream.Stream<HostSessionEvent, SessionEventsError>
}
