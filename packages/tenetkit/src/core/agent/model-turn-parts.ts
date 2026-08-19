import { Cause, Option, Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { classify as classifyContextOverflow } from "../model/context-overflow.js"
import { AgentError, ToolNameCollision } from "./agent-event.js"

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

export const classifyOtherFailure = (error: unknown) => classifyContextOverflow(error)

export const isToolNameCollision = Schema.is(ToolNameCollision)

export const singleFailure = (cause: Cause.Cause<unknown>): Option.Option<unknown> => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? Option.some(reason.error) : Option.none()
}

export const makeRetryableOverflow =
  (input: {
    readonly retryOverflow: boolean
    readonly canCompact: boolean
    readonly classify: (error: unknown) => string
  }) =>
  (cause: Cause.Cause<unknown>, hasEmitted: boolean): boolean => {
    const failure = singleFailure(cause)
    if (Option.isNone(failure)) return false
    const error =
      Schema.is(AgentError)(failure.value) && failure.value.cause !== undefined ? failure.value.cause : failure.value
    return input.retryOverflow && !hasEmitted && input.canCompact && input.classify(error) === "context-overflow"
  }
