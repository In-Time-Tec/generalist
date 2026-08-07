import { Effect, Function, Option, Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import type { ParseOptions } from "effect/SchemaAST"
import { AgentError, MiddlewareViolation } from "./agent-event.js"
import { activateSkillToolName } from "./agent-skill-tool.js"
import { isMessageFromRecall, recalledMessageIdentity, replaceRecalledMessage } from "../context/memory.js"
import type { Middleware, TurnContext } from "../model/model-middleware.js"
import type { Entry } from "../context/session.js"

export const providerOutputState = () => ({ textCharacters: 0, reasoningCharacters: 0, finishReason: undefined })
export const errorMessage = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

export const withSystem: {
  (instructions: string): (prompt: Prompt.Prompt) => Prompt.Prompt
  (instructions: string, prompt: Prompt.Prompt): Prompt.Prompt
} = Function.dual(
  2,
  (instructions: string, prompt: Prompt.Prompt): Prompt.Prompt =>
    Prompt.fromMessages([Prompt.makeMessage("system", { content: instructions }), ...prompt.content]),
)

export const skillListingsInstructions = (listings: string): string =>
  `Available skills:\n${listings}\n\nCall ${activateSkillToolName} with a listed skill name to load its full body before using it.`

export const recalledMessages = (prompt: Prompt.Prompt): ReadonlyArray<Prompt.Message> =>
  prompt.content.filter(isMessageFromRecall).map(recalledMessageIdentity)

export const messageJsonStringCodec = Schema.fromJsonString(Schema.toCodecJson(Prompt.Message))

/** @experimental */
export const encodeMessage: {
  (input: Prompt.Message, options?: ParseOptions): Effect.Effect<string, Schema.SchemaError, never>
  (options?: ParseOptions): (input: Prompt.Message) => Effect.Effect<string, Schema.SchemaError, never>
} = Function.dual(
  (args) => Prompt.isMessage(args[0]),
  (input: Prompt.Message, options?: ParseOptions): Effect.Effect<string, Schema.SchemaError, never> =>
    Schema.encodeEffect(messageJsonStringCodec)(input, options),
)

/** @experimental */
export const decodeMessage: {
  (input: string, options?: ParseOptions): Effect.Effect<Prompt.Message, Schema.SchemaError, never>
  (options?: ParseOptions): (input: string) => Effect.Effect<Prompt.Message, Schema.SchemaError, never>
} = Function.dual(
  (args) => typeof args[0] === "string",
  (input: string, options?: ParseOptions): Effect.Effect<Prompt.Message, Schema.SchemaError, never> =>
    Schema.decodeEffect(messageJsonStringCodec)(input, options),
)

export const detachMessage = (message: Prompt.Message) =>
  encodeMessage(message).pipe(
    Effect.flatMap((encoded) => decodeMessage(encoded)),
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

export const preservesRecalledMessages: {
  (
    required: ReadonlyArray<Prompt.Message>,
    transformed: Prompt.Prompt,
  ): (allowed: ReadonlyArray<Prompt.Message>) => boolean
  (allowed: ReadonlyArray<Prompt.Message>, required: ReadonlyArray<Prompt.Message>, transformed: Prompt.Prompt): boolean
} = Function.dual(
  3,
  (
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
  },
)

/** Fold the prompt through every `transformPrompt` hook in array order. */
export const applyPromptChain: {
  (
    prompt: Prompt.Prompt,
    context: TurnContext,
  ): (chain: ReadonlyArray<Middleware>) => Effect.Effect<Prompt.Prompt, AgentError | MiddlewareViolation>
  (
    chain: ReadonlyArray<Middleware>,
    prompt: Prompt.Prompt,
    context: TurnContext,
  ): Effect.Effect<Prompt.Prompt, AgentError | MiddlewareViolation>
} = Function.dual(
  3,
  (
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
    }),
)

/** Thread a stream part through every `transformPart` hook; the first `none()` short-circuits. */
export const applyPartChain: {
  (
    part: Response.StreamPart<Record<string, Tool.Any>>,
    context: TurnContext,
  ): (
    chain: ReadonlyArray<Middleware>,
  ) => Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, AgentError>
  (
    chain: ReadonlyArray<Middleware>,
    part: Response.StreamPart<Record<string, Tool.Any>>,
    context: TurnContext,
  ): Effect.Effect<Option.Option<Response.StreamPart<Record<string, Tool.Any>>>, AgentError>
} = Function.dual(
  3,
  (
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
    }),
)
