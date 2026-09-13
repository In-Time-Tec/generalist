import { Schema, type Effect } from "effect"
import type { UnknownAgent } from "../errors.js"
import { Prompt } from "effect/unstable/ai"
import { BudgetLimits } from "../../core/durable/run-budget.js"
import { ExecutableManifest, ExecutableRef } from "../executable/manifest.js"
import { ExecutableRegistration } from "../executable/registration.js"
import { TreePolicy } from "../tree/policy.js"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { MessageSource } from "../run/steering.js"

/** The immutable executable and settings selected for conversational input. @experimental */
export const SessionSelection = Schema.Struct({
  executableRef: ExecutableRef,
  executableManifest: ExecutableManifest,
  registrations: Schema.Array(ExecutableRegistration),
  treePolicy: Schema.optionalKey(TreePolicy),
  budget: Schema.optionalKey(BudgetLimits),
})
export type SessionSelection = typeof SessionSelection.Type
/** Resolve an allowed Agent only for a new command, after immutable receipt reconciliation. @experimental */
export type SelectionResolver = (agent: string) => Effect.Effect<SessionSelection, UnknownAgent>

/** One editable instruction waiting for its own Run. @experimental */
export const PendingInput = Schema.Struct({
  from: Schema.optionalKey(MessageSource),
  id: Schema.String,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
  prompt: Prompt.Prompt,
  selection: SessionSelection,
})
export type PendingInput = typeof PendingInput.Type

/** An immutable queue command acknowledgement, not the current queue status. @experimental */
export const QueueReceipt = Schema.Struct({
  id: Schema.String,
  revision: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type QueueReceipt = typeof QueueReceipt.Type

export class SessionIdempotencyConflict extends ActionableTaggedError<SessionIdempotencyConflict>()(
  "generalist/session/IdempotencyConflict",
  {
    sessionId: Schema.String,
    commandId: Schema.String,
    hint: errorHint("Retry the original Session command unchanged, or use a new command identity."),
  },
) {}

/** A queue mutation lost a revision race or exceeded a supported bound. @experimental */
export class SessionQueueConflict extends ActionableTaggedError<SessionQueueConflict>()(
  "generalist/session/SessionQueueConflict",
  {
    sessionId: Schema.String,
    reason: Schema.Literals(["revision", "capacity", "selection", "closed"]),
    hint: errorHint("Reload the Session queue and retry with its current revision and pinned Agent selection."),
  },
) {}

export const SubmitInput = Schema.Struct({
  sessionId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  prompt: Prompt.Prompt,
  selection: Schema.optionalKey(SessionSelection),
  agent: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
})
export type SubmitInput = typeof SubmitInput.Type

export const ControlInput = Schema.Struct({
  sessionId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  action: Schema.Literals(["stop", "close", "resume"]),
})
export type ControlInput = typeof ControlInput.Type

export const UpdateInput = Schema.Struct({
  ...SubmitInput.fields,
  agent: Schema.optionalKey(Schema.String.check(Schema.isNonEmpty())),
  id: Schema.String,
  expectedRevision: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type UpdateInput = typeof UpdateInput.Type

export const RemoveInput = Schema.Struct({
  sessionId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  id: Schema.String,
  expectedRevision: Schema.Int.check(Schema.isGreaterThan(0)),
})
export type RemoveInput = typeof RemoveInput.Type
