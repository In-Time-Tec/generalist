import { Function, HashMap } from "effect"
import { Response } from "effect/unstable/ai"
import type { DomainFailure, SettledOutcome, Success } from "../../tools/tool-executor.js"
import type { Source as CapabilitySource } from "../../capability/state.js"

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
