import { Cause, Effect, Ref, Schema } from "effect"
import { Chat } from "effect/unstable/ai"
import { Agent, AgentEvent, ToolExecutor, TurnPolicy } from "@batonfx/core"
import type { FrameJournal } from "./frame-journal.js"
import type { CoordinationState } from "./session-coordination.js"
import { SessionError } from "./session-registry-errors.js"
import type { SessionInfo } from "./session-registry.js"
import type { EventType, RunFailure } from "./wire.js"

export interface SessionState {
  readonly sessionId: string
  readonly chatId: string
  readonly chat: Ref.Ref<Chat.Persisted>
  readonly system?: string
  readonly coordination: CoordinationState
  readonly journal: FrameJournal
}

export interface RegistryState {
  readonly sessions: ReadonlyMap<string, SessionState>
}

export type RunSubmission =
  | { readonly _tag: "Enqueued" }
  | { readonly _tag: "Reserved"; readonly session: SessionState }

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const sessionError = (message: string): SessionError => SessionError.make({ message })

const infoFrom = (session: SessionState): Effect.Effect<SessionInfo> =>
  session.journal.lastSeq.pipe(
    Effect.map((lastSeq) => ({
      sessionId: session.sessionId,
      chatId: session.chatId,
      status: session.coordination.status,
      lastSeq,
      idleSince: session.coordination.idleSince,
      pendingMessages: session.coordination.pendingRuns.length,
    })),
  )

const nonNegativeInteger = (name: string, value: number): Effect.Effect<number> =>
  Number.isSafeInteger(value) && value >= 0
    ? Effect.succeed(value)
    : Effect.die(new TypeError(`${name} must be a non-negative safe integer`))

const positiveInteger = (name: string, value: number): Effect.Effect<number> =>
  Number.isSafeInteger(value) && value > 0
    ? Effect.succeed(value)
    : Effect.die(new TypeError(`${name} must be a positive safe integer`))

const stripEventTranscript = (event: AgentEvent.Event, strip: boolean): EventType => {
  if (!strip) return event
  if (event._tag === "TurnCompleted") {
    const { transcript: _transcript, ...rest } = event
    return rest
  }
  if (event._tag === "Completed") {
    const { transcript: _transcript, ...rest } = event
    return rest
  }
  return event
}

const runFailureFromCause = (cause: Cause.Cause<Agent.RunError | SessionError>, turn: number): RunFailure => {
  const error = Cause.squash(cause)
  if (Schema.is(AgentEvent.AgentError)(error)) return error
  if (Schema.is(AgentEvent.ResumeMismatch)(error)) return error
  if (Schema.is(TurnPolicy.TurnPolicyError)(error)) return error
  if (Schema.is(AgentEvent.TurnPolicyStopped)(error)) return error
  if (Schema.is(AgentEvent.TurnLimitExceeded)(error)) return error
  if (Schema.is(AgentEvent.MiddlewareViolation)(error)) return error
  if (Schema.is(ToolExecutor.FrameworkFailure)(error)) return error
  const message = Cause.hasInterrupts(cause) ? "Session interrupted" : errorMessage(error)
  return AgentEvent.AgentError.make({ message, turn, cause: error })
}

export const sessionRegistryRuntime = {
  errorMessage,
  sessionError,
  infoFrom,
  nonNegativeInteger,
  positiveInteger,
  stripEventTranscript,
  runFailureFromCause,
}
