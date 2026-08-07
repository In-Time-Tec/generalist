import { Effect, Option } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import { SessionStore, buildContext } from "../context/session.js"
import type { Event as ModelTelemetryEvent } from "../model/model-telemetry.js"
import { withSystem } from "./agent-message.js"

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
  readonly projection: Prompt.Prompt
}): Prompt.Prompt =>
  input.system === undefined || input.projection.content.some((message) => message.role === "system")
    ? input.projection
    : withSystem(input.system, input.projection)

/**
 * @experimental Seed a new Chat from the active Session path.
 *
 * A run continues its Session instead of starting empty, which is what makes a second turn carry the
 * first. Returns undefined when no Session is active or the caller supplied explicit history.
 */
export const seedFromSession = (input: {
  readonly activeSession: Option.Option<typeof SessionStore.Service>
  readonly suppliedHistory: Prompt.RawInput | undefined
}): Effect.Effect<Option.Option<Prompt.Prompt>, import("../context/session.js").SessionStoreError> =>
  input.suppliedHistory !== undefined || Option.isNone(input.activeSession)
    ? Effect.succeedNone
    : input.activeSession.value.path().pipe(
        Effect.map(buildContext),
        Effect.map((projection) => (projection.content.length === 0 ? Option.none() : Option.some(projection))),
      )

/** @experimental Build the Chat a run starts from, preferring an active Session over supplied history. */
export const initialChat = (input: {
  readonly sessionHistory: Option.Option<Prompt.Prompt>
  readonly suppliedHistory: Prompt.RawInput | undefined
  readonly system: string | undefined
}): Effect.Effect<Chat.Service> => {
  if (Option.isSome(input.sessionHistory))
    return Chat.fromPrompt(withDerivedSystem({ system: input.system, projection: input.sessionHistory.value }))
  if (input.suppliedHistory !== undefined) return Chat.fromPrompt(input.suppliedHistory)
  return input.system === undefined
    ? Chat.empty
    : Chat.fromPrompt([Prompt.makeMessage("system", { content: input.system })])
}

/**
 * @experimental Reopen the delivery outbox for a recovered checkpoint.
 *
 * Checkpoint telemetry was already observed live and recorded by the host. Restoring it lets an
 * unacknowledged batch be retried, but re-emitting it would replay events the run log already holds
 * and read as a conflicting model call.
 */
export const restoreCheckpointTelemetry = (input: {
  readonly session: typeof SessionStore.Service
  readonly undelivered: Array<ModelTelemetryEvent>
}): Effect.Effect<void, import("../context/session.js").SessionStoreError> =>
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
