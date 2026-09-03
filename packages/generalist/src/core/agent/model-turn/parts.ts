import { Cause, Effect, HashMap, Option, Ref, Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { classify as classifyContextOverflow } from "../../model/result/context-overflow.js"
import { Exhausted } from "../../durable/run-budget.js"
import { AgentError, DuplicateToolCallId, ToolNameCollision } from "../event.js"
import { persistResponsePart, resolvePrompt } from "../../../media/prompt.js"
import type { ToolCallIdState } from "../tools/result.js"

export const providerOutput = {
  capture: (
    state: { textCharacters: number; reasoningCharacters: number; finishReason: string | undefined },
    part: Response.StreamPart<Record<string, Tool.Any>>,
  ): void => {
    if (part.type === "text-delta") state.textCharacters += part.delta.length
    if (part.type === "reasoning-delta") state.reasoningCharacters += part.delta.length
    if (part.type === "finish") state.finishReason = part.reason
  },
} as const

export const classifyOtherFailure = <E>(error: E) => classifyContextOverflow(error)

export const isToolNameCollision = Schema.is(ToolNameCollision)

export const isPassThroughFailure = Schema.is(Schema.Union([ToolNameCollision, Exhausted]))

export const singleFailure = (cause: Cause.Cause<unknown>): Option.Option<unknown> => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
}

export const initialToolCallIdState: ToolCallIdState = { nextIndex: 0, firstIndexes: HashMap.empty() }

export const validateToolCallId = (options: {
  readonly idState: Ref.Ref<ToolCallIdState>
  readonly part: Response.StreamPart<Record<string, Tool.Any>>
}): Effect.Effect<void, DuplicateToolCallId> => {
  const part = options.part
  if (part.type !== "tool-call") return Effect.void
  return Ref.modify(options.idState, (current) => {
    const existingFirstIndex = HashMap.get(current.firstIndexes, part.id)
    const duplicate = Option.map(existingFirstIndex, (index) =>
      DuplicateToolCallId.make({ id: part.id, firstIndex: index, duplicateIndex: current.nextIndex }),
    )
    return [
      duplicate,
      {
        nextIndex: current.nextIndex + 1,
        firstIndexes: Option.isSome(existingFirstIndex)
          ? current.firstIndexes
          : HashMap.set(current.firstIndexes, part.id, current.nextIndex),
      },
    ]
  }).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.void,
        onSome: Effect.fail,
      }),
    ),
  )
}

export const resolveMediaPrompt = (options: { readonly prompt: Prompt.Prompt; readonly turn: number }) =>
  resolvePrompt(options.prompt).pipe(
    Effect.mapError((cause) =>
      AgentError.make({ message: "Prompt media cannot be resolved", turn: options.turn, cause }),
    ),
  )

export const persistMediaPart = <T extends Response.AnyPart>(options: { readonly part: T; readonly turn: number }) =>
  persistResponsePart(options.part).pipe(
    Effect.mapError((cause) =>
      AgentError.make({ message: "Generated media cannot be persisted", turn: options.turn, cause }),
    ),
  )
