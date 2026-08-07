import { Cause, Schema } from "effect"
import { AgentEvent, RunBudget } from "@batonfx/core"
import { AgentExecutionFailure } from "./errors.js"

const summary = (failure: unknown): string | undefined => {
  if (Schema.is(RunBudget.RunBudgetExhausted)(failure)) {
    const remaining = failure.remaining === undefined ? "unavailable" : failure.remaining
    return `Run budget exhausted for ${failure.dimension}: requested ${failure.requested}, remaining ${remaining}`
  }
  if (Schema.is(AgentEvent.ResumeMismatch)(failure)) {
    return `Agent resume ${failure.reason} for ${failure.received.tool_name} call ${failure.received.tool_call_id}`
  }
  return undefined
}

const singleFailure = (cause: Cause.Cause<unknown>): unknown => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return reason !== undefined && Cause.isFailReason(reason) ? reason.error : undefined
}

export const makeAgentExecutionFailure = (cause: Cause.Cause<unknown>): AgentExecutionFailure => {
  const failure = singleFailure(cause)
  const typed =
    Schema.is(RunBudget.RunBudgetExhausted)(failure) || Schema.is(AgentEvent.ResumeMismatch)(failure)
      ? failure
      : undefined
  const squashed = Cause.squash(cause)
  const fallback = squashed instanceof Error ? squashed.message : String(squashed)
  const message = summary(failure) ?? (fallback.trim().length === 0 ? "Agent execution failed" : fallback)
  return AgentExecutionFailure.make({ message, ...(typed === undefined ? {} : { failure: typed }) })
}
