import { Effect, Option } from "effect"
import { Chat, Prompt } from "effect/unstable/ai"
import { SessionStore, buildContext } from "../context/session.js"
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
export const withDerivedSystem = (system: string | undefined, projection: Prompt.Prompt): Prompt.Prompt =>
  system === undefined || projection.content.some((message) => message.role === "system")
    ? projection
    : withSystem(system, projection)

/**
 * @experimental Seed a new Chat from the active Session path.
 *
 * A run continues its Session instead of starting empty, which is what makes a second turn carry the
 * first. Returns undefined when no Session is active or the caller supplied explicit history.
 */
export const seedFromSession = (input: {
  readonly activeSession: Option.Option<typeof SessionStore.Service>
  readonly suppliedHistory: Prompt.RawInput | undefined
}): Effect.Effect<Prompt.Prompt | undefined, import("../context/session.js").SessionStoreError> =>
  input.suppliedHistory !== undefined || Option.isNone(input.activeSession)
    ? Effect.succeed(undefined)
    : input.activeSession.value.path().pipe(
        Effect.map(buildContext),
        Effect.map((projection) => (projection.content.length === 0 ? undefined : projection)),
      )

/** @experimental Build the Chat a run starts from, preferring an active Session over supplied history. */
export const initialChat = (input: {
  readonly sessionHistory: Prompt.Prompt | undefined
  readonly suppliedHistory: Prompt.RawInput | undefined
  readonly system: string | undefined
}): Effect.Effect<Chat.Service> => {
  if (input.sessionHistory !== undefined) return Chat.fromPrompt(withDerivedSystem(input.system, input.sessionHistory))
  if (input.suppliedHistory !== undefined) return Chat.fromPrompt(input.suppliedHistory)
  return input.system === undefined
    ? Chat.empty
    : Chat.fromPrompt([Prompt.makeMessage("system", { content: input.system })])
}
