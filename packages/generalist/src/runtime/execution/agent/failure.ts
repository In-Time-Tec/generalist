import { Cause, Schema } from "effect"
import {
  DuplicateToolCallId,
  MiddlewareViolation,
  ProgressOverflow,
  ResumeMismatch,
  RunEndedWithoutOutput,
  ToolNameCollision,
  TurnLimitExceeded,
  PolicyStopped,
} from "../../../core/agent/event.js"
import { Exhausted } from "../../../core/durable/run-budget.js"
import { GateFailed } from "../../../core/agent/gates/definition.js"
import { AgentExecutionFailure, StructuredAgentFailure } from "../../errors.js"
import { HookFailed } from "../../../hooks/index.js"

const pendingCalls = (pending: ReadonlyArray<{ readonly tool_name: string; readonly tool_call_id: string }>): string =>
  pending.length === 0
    ? "no pending tool calls"
    : pending.map((call) => `${call.tool_name}(${call.tool_call_id})`).join(", ")

/**
 * Render one typed agent failure as its own sentence. Several of these errors carry no `message`
 * field, so squashing them yields an empty string that would otherwise be replaced by a generic
 * phrase. Every variant is named here so a terminal failure always states what actually happened.
 */
const SummaryFailure = Schema.Union([
  Exhausted,
  HookFailed,
  GateFailed,
  ResumeMismatch,
  TurnLimitExceeded,
  PolicyStopped,
  RunEndedWithoutOutput,
  MiddlewareViolation,
  DuplicateToolCallId,
  ProgressOverflow,
  ToolNameCollision,
])
type SummaryFailure = typeof SummaryFailure.Type

const summary = (failure: SummaryFailure): string | undefined => {
  if (Schema.is(HookFailed)(failure)) {
    return `${failure.event} hook failed: ${failure.hint}`
  }
  if (Schema.is(GateFailed)(failure)) {
    return `Completion gate ${failure.gate.name} failed: ${JSON.stringify(failure.gate.evidence)}`
  }
  if (Schema.is(Exhausted)(failure)) {
    const remaining = failure.remaining === undefined ? "unavailable" : failure.remaining
    return `Run budget exhausted for ${failure.budget}: requested ${failure.requested}, remaining ${remaining}`
  }
  if (Schema.is(ResumeMismatch)(failure)) {
    return `Agent resume ${failure.reason} for waits ${failure.received.waits.map((wait) => wait.waitId).join(", ")}`
  }
  if (Schema.is(TurnLimitExceeded)(failure)) {
    return `Turn limit of ${failure.limit} reached at turn ${failure.turn} with ${pendingCalls(failure.pending)}`
  }
  if (Schema.is(PolicyStopped)(failure)) {
    return `Turn policy stopped the run at turn ${failure.turn} (${failure.reason._tag}) with ${pendingCalls(failure.pending)}`
  }
  if (Schema.is(RunEndedWithoutOutput)(failure)) {
    const reason = failure.finishReason ?? "no terminal event"
    return `Turn ${failure.turn} ended with no assistant text (finish reason ${reason}, ${failure.providerTextCharacters} text and ${failure.reasoningCharacters} reasoning characters streamed)`
  }
  if (Schema.is(MiddlewareViolation)(failure)) {
    return `Model middleware violated the loop contract at turn ${failure.turn}: ${failure.detail}`
  }
  if (Schema.is(DuplicateToolCallId)(failure)) {
    return `Model reused tool call id ${failure.id} at index ${failure.duplicateIndex} after index ${failure.firstIndex}`
  }
  if (Schema.is(ProgressOverflow)(failure)) {
    return `Tool progress queue for call ${failure.toolCallId} overflowed its capacity of ${failure.capacity} at turn ${failure.turn}`
  }
  if (Schema.is(ToolNameCollision)(failure)) {
    return `Tool name ${failure.name} is declared by ${failure.origins.map((origin) => origin._tag).join(", ")}`
  }
  return undefined
}

const typedFailure = (cause: Cause.Cause<unknown>) => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  if (reason === undefined || !Cause.isFailReason(reason)) return undefined
  return Schema.decodeUnknownOption(StructuredAgentFailure)(reason.error).pipe((decoded) =>
    decoded._tag === "Some" ? decoded.value : undefined,
  )
}

/**
 * Every rendered sentence across a multi-reason cause. A cause that carries more than one reason
 * would otherwise fall through to the squashed defect and lose the typed failure entirely.
 */
const summaries = (cause: Cause.Cause<unknown>): ReadonlyArray<string> =>
  cause.reasons.flatMap((reason) => {
    if (!Cause.isFailReason(reason)) return []
    const decoded = Schema.decodeUnknownOption(SummaryFailure)(reason.error)
    if (decoded._tag === "None") return []
    const rendered = summary(decoded.value)
    return rendered === undefined ? [] : [rendered]
  })

export const make = (cause: Cause.Cause<unknown>): AgentExecutionFailure => {
  const typed = typedFailure(cause)
  const squashed = Cause.squash(cause)
  const fallback = squashed instanceof Error ? squashed.message : String(squashed)
  const rendered = summaries(cause)
  let message = fallback
  if (rendered.length > 0) message = rendered.join("; ")
  else if (fallback.trim().length === 0) message = `Agent execution failed: ${Cause.pretty(cause)}`.trim()
  const result = AgentExecutionFailure.make({ message })
  if (typed !== undefined) return AgentExecutionFailure.make({ message, failure: typed })
  return result
}
