import { Cause, Schema } from "effect"
import { AgentEvent, RunBudget } from "@batonfx/core"
import { AgentExecutionFailure } from "./errors.js"

const pendingCalls = (pending: ReadonlyArray<{ readonly tool_name: string; readonly tool_call_id: string }>): string =>
  pending.length === 0
    ? "no pending tool calls"
    : pending.map((call) => `${call.tool_name}(${call.tool_call_id})`).join(", ")

/**
 * Render one typed agent failure as its own sentence. Several of these errors carry no `message`
 * field, so squashing them yields an empty string that would otherwise be replaced by a generic
 * phrase. Every variant is named here so a terminal failure always states what actually happened.
 */
const summary = (failure: unknown): string | undefined => {
  if (Schema.is(RunBudget.RunBudgetExhausted)(failure)) {
    const remaining = failure.remaining === undefined ? "unavailable" : failure.remaining
    return `Run budget exhausted for ${failure.dimension}: requested ${failure.requested}, remaining ${remaining}`
  }
  if (Schema.is(AgentEvent.ResumeMismatch)(failure)) {
    return `Agent resume ${failure.reason} for ${failure.received.tool_name} call ${failure.received.tool_call_id}`
  }
  if (Schema.is(AgentEvent.TurnLimitExceeded)(failure)) {
    return `Turn limit of ${failure.limit} reached at turn ${failure.turn} with ${pendingCalls(failure.pending)}`
  }
  if (Schema.is(AgentEvent.TurnPolicyStopped)(failure)) {
    return `Turn policy stopped the run at turn ${failure.turn} (${failure.reason._tag}) with ${pendingCalls(failure.pending)}`
  }
  if (Schema.is(AgentEvent.RunEndedWithoutOutput)(failure)) {
    const reason = failure.finishReason ?? "no terminal event"
    return `Turn ${failure.turn} ended with no assistant text (finish reason ${reason}, ${failure.providerTextCharacters} text and ${failure.reasoningCharacters} reasoning characters streamed)`
  }
  if (Schema.is(AgentEvent.MiddlewareViolation)(failure)) {
    return `Model middleware violated the loop contract at turn ${failure.turn}: ${failure.detail}`
  }
  if (Schema.is(AgentEvent.DuplicateToolCallId)(failure)) {
    return `Model reused tool call id ${failure.id} at index ${failure.duplicateIndex} after index ${failure.firstIndex}`
  }
  if (Schema.is(AgentEvent.ProgressOverflow)(failure)) {
    return `Tool progress queue for call ${failure.toolCallId} overflowed its capacity of ${failure.capacity} at turn ${failure.turn}`
  }
  if (Schema.is(AgentEvent.ToolNameCollision)(failure)) {
    return `Tool name ${failure.name} is declared by ${failure.origins.map((origin) => origin._tag).join(", ")}`
  }
  return undefined
}

const singleFailure = (cause: Cause.Cause<unknown>): unknown => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? reason.error : undefined
}

/**
 * Every rendered sentence across a multi-reason cause. A cause that carries more than one reason
 * would otherwise fall through to the squashed defect and lose the typed failure entirely.
 */
const summaries = (cause: Cause.Cause<unknown>): ReadonlyArray<string> =>
  cause.reasons.flatMap((reason) => {
    if (!Cause.isFailReason(reason)) return []
    const rendered = summary(reason.error)
    return rendered === undefined ? [] : [rendered]
  })

export const makeAgentExecutionFailure = (cause: Cause.Cause<unknown>): AgentExecutionFailure => {
  const failure = singleFailure(cause)
  const typed =
    Schema.is(RunBudget.RunBudgetExhausted)(failure) || Schema.is(AgentEvent.ResumeMismatch)(failure)
      ? failure
      : undefined
  const squashed = Cause.squash(cause)
  const fallback = squashed instanceof Error ? squashed.message : String(squashed)
  const rendered = summaries(cause)
  const message =
    rendered.length > 0
      ? rendered.join("; ")
      : fallback.trim().length === 0
        ? `Agent execution failed: ${Cause.pretty(cause)}`.trim()
        : fallback
  return AgentExecutionFailure.make({ message, ...(typed === undefined ? {} : { failure: typed }) })
}
