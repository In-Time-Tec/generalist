import { Effect, Option, Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { AgentError, MiddlewareViolation } from "./agent-event.js"
import { activateSkillToolName } from "./agent-skill-tool.js"
import { isMessageFromRecall, recalledMessageIdentity, replaceRecalledMessage } from "../context/memory.js"
import type { Middleware, TurnContext } from "../model/model-middleware.js"
import type { Entry } from "../context/session.js"

export const withSystem = (instructions: string, prompt: Prompt.Prompt): Prompt.Prompt =>
  Prompt.fromMessages([Prompt.makeMessage("system", { content: instructions }), ...prompt.content])

export const skillListingsInstructions = (listings: string): string =>
  `Available skills:\n${listings}\n\nCall ${activateSkillToolName} with a listed skill name to load its full body before using it.`

export const recalledMessages = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.Message> =>
  prompt.content.filter(isMessageFromRecall).map(recalledMessageIdentity)

export const messageJsonStringCodec = Schema.fromJsonString(Schema.toCodecJson(Prompt.Message))
export const encodeMessage = Schema.encodeEffect(messageJsonStringCodec)
export const decodeMessage = Schema.decodeEffect(messageJsonStringCodec)

export const detachMessage = (message: Prompt.Message) =>
  encodeMessage(message).pipe(
    Effect.flatMap(decodeMessage),
    Effect.map((detached) =>
      isMessageFromRecall(message) && message.role === "user" && detached.role === "user"
        ? replaceRecalledMessage(message, detached.content)
        : detached,
    ),
  )

export const detachPrompt = (prompt: Prompt.Prompt) =>
  Effect.forEach(prompt.content, detachMessage).pipe(Effect.map(Prompt.fromMessages))

export const detachEntry = (entry: Entry) =>
  entry._tag === "Message" || entry._tag === "Steering"
    ? detachMessage(entry.message).pipe(Effect.map((message): Entry => ({ ...entry, message })))
    : Effect.succeed(entry)

export const preservesRecalledMessages = (
  allowed: ReadonlyArray<Prompt.Message>,
  required: ReadonlyArray<Prompt.Message>,
  transformed: Prompt.Prompt,
): boolean => {
  const allowedSet = new Set(allowed)
  const transformedMessages = recalledMessages(transformed)
  const transformedSet = new Set(transformedMessages)
  return (
    transformedSet.size === transformedMessages.length &&
    transformedMessages.every((message) => allowedSet.has(message)) &&
    required.every((message) => transformedSet.has(message))
  )
}

/** Fold the prompt through every `transformPrompt` hook in array order. */
export const applyPromptChain = (
  chain: ReadonlyArray<Middleware>,
  prompt: Prompt.Prompt,
  context: TurnContext,
): Effect.Effect<Prompt.Prompt, AgentError | MiddlewareViolation> =>
  Effect.gen(function* () {
    let current = prompt
    for (const middleware of chain) {
      if (middleware.transformPrompt !== undefined) {
        const recalled = recalledMessages(current)
        const transformed = yield* middleware.transformPrompt(current, context)
        if (!preservesRecalledMessages(recalled, recalled, transformed)) {
          return yield* MiddlewareViolation.make({
            turn: context.turn,
            detail: "Prompt middleware must preserve recalled-memory message lineage",
          })
        }
        current = transformed
      }
    }
    return current
  })

/** Thread a stream part through every `transformPart` hook; the first `none()` short-circuits. */
export const applyPartChain = (
  chain: ReadonlyArray<Middleware>,
  part: Response.StreamPart<Record<string, Tool.Any>>,
  context: TurnContext,
): Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, AgentError> =>
  Effect.gen(function* () {
    let current: Option.Option<Response.StreamPart<Record<string, Tool.Any>>> = Option.some(part)
    for (const middleware of chain) {
      if (Option.isNone(current)) break
      if (middleware.transformPart !== undefined) {
        current = yield* middleware.transformPart(current.value, context)
      }
    }
    return current
  })
