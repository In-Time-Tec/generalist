import { Effect, Option, Ref } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import { buildContext, type SessionStore } from "../../context/session.js"
import type { Event as ModelTelemetryEvent } from "../../model/telemetry/events.js"
import { AgentError, ResumeMismatch } from "../event.js"
import { sameSuspension, suspensionCheckpoint, type SuspensionCheckpoint } from "../suspension.js"
import { systemPrompt } from "../message.js"

/**
 * @experimental Session owns model-facing history; a Chat is its live view.
 *
 * The system message is derived from current instructions on every run, so it is never a Session
 * entry. These helpers are the single boundary between the two representations: entries hold
 * conversation only, and a Chat regains the derived system message whenever one is rebuilt.
 */

/** @experimental Drop the derived system message before conversation becomes durable state. */
export const conversationOnly = (prompt: Prompt.Prompt): Prompt.Prompt =>
  prompt.content.some((message) => message.role === "system")
    ? Prompt.fromMessages(prompt.content.filter((message) => message.role !== "system"))
    : prompt

/** @experimental Restore a Session projection into a Chat by prepending the derived system message. */
export const withDerivedSystem = (input: {
  readonly system: string | undefined
  readonly supplemental?: string | undefined
  readonly projection: Prompt.Prompt
}): Prompt.Prompt =>
  input.system === undefined
    ? input.projection
    : Prompt.concat(systemPrompt(input.supplemental, input.system), input.projection)

/**
 * @experimental Seed a new Chat from the active Session path.
 *
 * A run continues its Session instead of starting empty, which is what makes a second turn carry the
 * first. Returns undefined when no Session is active or the caller supplied explicit history.
 */
export const seedFromSession = (input: {
  readonly activeSession: Option.Option<SessionStore>
  readonly suppliedHistory: Prompt.RawInput | undefined
}): Effect.Effect<Option.Option<Prompt.Prompt>, import("../../context/session.js").SessionStoreError> =>
  input.suppliedHistory !== undefined || Option.isNone(input.activeSession)
    ? Effect.succeedNone
    : input.activeSession.value.path().pipe(Effect.map(buildContext), Effect.map(Option.some))

/** @experimental Build the Chat a run starts from, preferring an active Session over supplied history. */
export const initialChat = (input: {
  readonly sessionHistory: Option.Option<Prompt.Prompt>
  readonly suppliedHistory: Prompt.RawInput | undefined
  readonly system: string | undefined
  readonly supplemental?: string | undefined
}): Effect.Effect<Chat.Service> => {
  if (Option.isSome(input.sessionHistory))
    return Chat.fromPrompt(
      withDerivedSystem({
        system: input.system,
        supplemental: input.supplemental,
        projection: input.sessionHistory.value,
      }),
    )
  if (input.suppliedHistory !== undefined) return Chat.fromPrompt(input.suppliedHistory)
  return input.system === undefined ? Chat.empty : Chat.fromPrompt(systemPrompt(input.supplemental, input.system))
}

/** @internal Validate one resume request against the authoritative Session projection. */
const validateResume = (
  history: Prompt.Prompt,
  received: import("../event.js").AgentSuspended,
): Effect.Effect<SuspensionCheckpoint, ResumeMismatch> => {
  const expected = suspensionCheckpoint(history.content, received)
  if (expected === undefined) return ResumeMismatch.make({ reason: "checkpoint-not-found", received })
  return sameSuspension(expected.suspension, received)
    ? Effect.succeed(expected)
    : ResumeMismatch.make({ reason: "identity-mismatch", expected: expected.suspension, received })
}

/** @internal Helpers shared by Session-backed setup without widening the public package facade. */
export const SessionHistoryInternal = { validateResume }

export const replayModelMessages = (input: {
  readonly activeSession: Option.Option<SessionStore>
  readonly sessionParentId: string
  readonly system: string | undefined
  readonly turn: number
  readonly sessionError: (turn: number, error: import("../../context/session.js").SessionStoreError) => AgentError
}): Effect.Effect<ReadonlyArray<Prompt.Message>, AgentError> =>
  Option.match(input.activeSession, {
    onNone: () =>
      Effect.fail(
        AgentError.make({
          message: `Recorded model operation references Session entry ${input.sessionParentId} without a Session store`,
          turn: input.turn,
        }),
      ),
    onSome: (session) =>
      session.path(input.sessionParentId).pipe(
        Effect.map((path) => withDerivedSystem({ system: input.system, projection: buildContext(path) }).content),
        Effect.mapError((error) => input.sessionError(input.turn, error)),
      ),
  })

/** @internal Rebuild a resume Chat from its authoritative Session projection. */
export const resumeChat = (input: {
  readonly activeSession: Option.Option<SessionStore>
  readonly suppliedHistory: Prompt.RawInput | undefined
}): Effect.Effect<Chat.Service, import("../../context/session.js").SessionStoreError> => {
  if (Option.isSome(input.activeSession)) {
    return input.activeSession.value.path().pipe(Effect.map(buildContext), Effect.flatMap(Chat.fromPrompt))
  }
  return input.suppliedHistory === undefined ? Chat.empty : Chat.fromPrompt(input.suppliedHistory)
}

/** @internal Refresh a resumed Session Chat with the system message derived for this Run. */
export const refreshResumeSystem = (input: {
  readonly chat: Chat.Service | undefined
  readonly activeSession: Option.Option<SessionStore>
  readonly system: string | undefined
  readonly supplemental?: string | undefined
}): Effect.Effect<void, import("../../context/session.js").SessionStoreError> => {
  if (input.chat === undefined || Option.isNone(input.activeSession)) return Effect.void
  return input.activeSession.value.path().pipe(
    Effect.map(buildContext),
    Effect.flatMap((projection) =>
      Ref.set(
        input.chat!.history,
        withDerivedSystem({ system: input.system, supplemental: input.supplemental, projection }),
      ),
    ),
  )
}

/**
 * @experimental Reopen the delivery outbox for a recovered checkpoint.
 *
 * Checkpoint telemetry was already observed live and recorded by the host. Restoring it lets an
 * unacknowledged batch be retried, but re-emitting it would replay events the run log already holds
 * and read as a conflicting model call.
 */
export const restoreCheckpointTelemetry = (input: {
  readonly session: SessionStore
  readonly undelivered: Array<ModelTelemetryEvent>
}): Effect.Effect<void, import("../../context/session.js").SessionStoreError> =>
  input.session.path().pipe(
    Effect.map((path) => path.findLast((entry) => entry._tag === "Compaction")),
    Effect.map((checkpoint) => {
      if (checkpoint?._tag !== "Compaction") return
      for (const event of checkpoint.telemetry) {
        if (input.undelivered.some((current) => current.deliveryId === event.deliveryId)) continue
        input.undelivered.push(event)
      }
    }),
  )
