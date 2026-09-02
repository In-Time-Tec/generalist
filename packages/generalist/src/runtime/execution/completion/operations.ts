import { Cause, Option, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { AgentSuspended } from "../../../core/agent/event.js"
import { BudgetExhausted, Exhausted } from "../../../core/durable/run-budget.js"
import { DriverCheckpoint } from "../../../core/durable/driver.js"
import { Suspended as NestedOperationSuspended } from "../../../core/tools/nested-operation.js"
import { RunTerminal } from "../../errors.js"
import type { ExecutionContinuation } from "../../run/steering.js"
import type { make as makeAgentRunOptions } from "../agent/run-options.js"
import type { DurableAgentLoopEvent } from "../agent/event.js"
import type { ExecutionCheckpoint } from "../state.js"

export interface PreparedCompletion {
  continuation?: ExecutionContinuation | null
  steeringEntryIds?: ReadonlyArray<string>
}

export type RunOptionsInput = {
  -readonly [Key in keyof Parameters<typeof makeAgentRunOptions>[0]]: Parameters<typeof makeAgentRunOptions>[0][Key]
}

export const continuationForOperation = (input: {
  readonly model: boolean
  readonly steeringEntryIds: ReadonlyArray<string>
  readonly steeringPrompt: Prompt.Prompt | undefined
  readonly completed: DurableAgentLoopEvent | undefined
  readonly current: ExecutionContinuation | undefined
}): ExecutionContinuation | null | undefined => {
  if (!input.model) return undefined
  if (input.steeringEntryIds.length === 0) return null
  if (input.completed?._tag !== "TurnCompleted" || input.steeringPrompt === undefined) return input.current
  return {
    schemaVersion: 1,
    prompt: input.steeringPrompt,
    nextTurn: input.completed.turn + 1,
    steeringEntryIds: input.steeringEntryIds,
  }
}

export const runTerminalReason = (reason: Cause.Reason<unknown> | undefined): boolean =>
  reason !== undefined && Cause.isFailReason(reason) && Schema.is(RunTerminal)(reason.error)

export const suspendedReason = (
  reason: Cause.Reason<unknown> | undefined,
): AgentSuspended | BudgetExhausted | NestedOperationSuspended | undefined => {
  if (reason === undefined || !Cause.isFailReason(reason)) return undefined
  const agent = Schema.decodeUnknownOption(AgentSuspended)(reason.error).pipe(Option.getOrUndefined)
  if (agent !== undefined) return agent
  const nested = Schema.decodeUnknownOption(NestedOperationSuspended)(reason.error).pipe(Option.getOrUndefined)
  if (nested !== undefined) return nested
  const budget = Schema.decodeUnknownOption(Exhausted)(reason.error).pipe(Option.getOrUndefined)
  return budget === undefined ? undefined : { _tag: "BudgetExhausted", budget: budget.budget }
}

export const driverCheckpoint = (value: ExecutionCheckpoint | undefined): DriverCheckpoint | undefined =>
  Schema.decodeUnknownOption(DriverCheckpoint)(value).pipe(Option.getOrUndefined)
