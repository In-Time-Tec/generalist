import { Cause, Option, Schema } from "effect"
import { Response, Tool } from "effect/unstable/ai"
import { classify as classifyContextOverflow } from "../../model/result/context-overflow.js"
import { Exhausted } from "../../durable/run-budget.js"
import { ToolNameCollision } from "../event.js"

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
