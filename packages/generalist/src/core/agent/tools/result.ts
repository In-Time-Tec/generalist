import { Effect, Function, HashMap, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import type { DomainFailure, Outcome, SettledOutcome, Success } from "../../tools/tool-executor.js"
import type { Source as CapabilitySource } from "../../capability/state.js"
import { Exhausted } from "../../durable/run-budget.js"
import type { Event } from "../event.js"
import type { RunError } from "../run/error.js"
import type { RunOptions } from "../service.js"
import { eventFields as taskEventFields } from "../../../tasks/internal.js"
import { artifactEventFields } from "../../artifact.js"

const interruption = { reason: "interrupted", message: "Tool execution was interrupted by an admitted message" }
export const interrupted: DomainFailure = {
  _tag: "DomainFailure",
  failure: interruption,
  encodedFailure: interruption,
}

export type AnyToolCall = Response.ToolCallPart<string, unknown>

export type PendingToolResult = Response.ToolResultPart<string, unknown, unknown> & {
  readonly taint: ReadonlyArray<CapabilitySource>
  readonly memoized?: {
    readonly fromRun: string
    readonly fromOperation: string
  }
}

/** @internal Restore a settled executor outcome from one exact tool result. */
export const outcomeFromResult = (result: PendingToolResult): SettledOutcome =>
  result.isFailure
    ? {
        _tag: "DomainFailure",
        failure: result.result,
        encodedFailure: result.encodedResult,
        taint: result.taint,
      }
    : {
        _tag: "Success",
        result: result.result,
        encodedResult: result.encodedResult,
        taint: result.taint,
      }

export interface ToolCallIdState {
  readonly nextIndex: number
  readonly firstIndexes: HashMap.HashMap<string, number>
}
export const successResult: {
  (outcome: Success): (call: AnyToolCall) => PendingToolResult
  (call: AnyToolCall, outcome: Success): PendingToolResult
} = Function.dual(2, (call: AnyToolCall, outcome: Success): PendingToolResult => {
  const result = Object.assign(
    Response.toolResultPart({
      id: call.id,
      name: call.name,
      isFailure: false,
      result: outcome.result,
      encodedResult: outcome.encodedResult,
      providerExecuted: false,
      preliminary: false,
    }),
    { taint: outcome.taint ?? [] },
  )
  return outcome.memoized === undefined ? result : Object.assign(result, { memoized: outcome.memoized })
})
export const domainFailureResult: {
  (outcome: DomainFailure): (call: AnyToolCall) => PendingToolResult
  (call: AnyToolCall, outcome: DomainFailure): PendingToolResult
} = Function.dual(
  2,
  (call: AnyToolCall, outcome: DomainFailure): PendingToolResult =>
    Object.assign(
      Response.toolResultPart({
        id: call.id,
        name: call.name,
        isFailure: true,
        result: outcome.failure,
        encodedResult: outcome.encodedFailure,
        providerExecuted: false,
        preliminary: false,
      }),
      { taint: outcome.taint ?? [] },
    ),
)

export const outcomeEvent = (input: {
  readonly turn: number
  readonly call: AnyToolCall
  readonly outcome: Outcome
  readonly droppedProgress: number
  readonly durableOperationKey: string
  readonly suspensionPropagation: RunOptions["suspensionPropagation"]
}): Effect.Effect<Event, RunError> => {
  const metadata = input.droppedProgress === 0 ? {} : { metadata: { toolProgress: { dropped: input.droppedProgress } } }
  const completion = (result: PendingToolResult): Effect.Effect<Event> =>
    Effect.succeed({
      _tag: "ToolExecutionCompleted",
      turn: input.turn,
      call: input.call,
      result,
      ...taskEventFields({ name: input.call.name, isFailure: result.isFailure, result: result.result }),
      ...artifactEventFields({ name: input.call.name, isFailure: result.isFailure, result: result.result }),
      ...metadata,
    })
  switch (input.outcome._tag) {
    case "Success":
      return completion(successResult(input.call, input.outcome))
    case "DomainFailure":
      if (Schema.is(Exhausted)(input.outcome.failure)) return Effect.fail(input.outcome.failure)
      return completion(domainFailureResult(input.call, input.outcome))
    case "Suspend": {
      if ((input.suspensionPropagation ?? "propagate") === "collapse-to-domain-failure") {
        const failure = {
          reason: "suspended" as const,
          message: `Tool ${input.call.name} suspended (${input.outcome.token})`,
        }
        return completion(domainFailureResult(input.call, { _tag: "DomainFailure", failure, encodedFailure: failure }))
      }
      return Effect.succeed({
        _tag: "ToolExecutionWaiting",
        turn: input.turn,
        call: input.call,
        waitId: input.durableOperationKey,
        token: input.outcome.token,
        ...(input.outcome.awaitEvent === undefined ? undefined : { awaitEvent: input.outcome.awaitEvent }),
      })
    }
  }
}
