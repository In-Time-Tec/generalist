import { Function, HashMap } from "effect"
import { Response } from "effect/unstable/ai"
import type { DomainFailure, Success } from "../../tools/tool-executor.js"

const interruption = { reason: "interrupted", message: "Tool execution was interrupted by an admitted message" }
export const interrupted: DomainFailure = {
  _tag: "DomainFailure",
  failure: interruption,
  encodedFailure: interruption,
}

export type AnyToolCall = Response.ToolCallPart<string, unknown>

export type PendingToolResult = Response.ToolResultPart<string, unknown, unknown> & {
  readonly memoized?: {
    readonly fromRun: string
    readonly fromOperation: string
  }
}

export interface ToolCallIdState {
  readonly nextIndex: number
  readonly firstIndexes: HashMap.HashMap<string, number>
}
export const successResult: {
  (outcome: Success): (call: AnyToolCall) => PendingToolResult
  (call: AnyToolCall, outcome: Success): PendingToolResult
} = Function.dual(2, (call: AnyToolCall, outcome: Success): PendingToolResult => {
  const result: PendingToolResult = Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: false,
    result: outcome.result,
    encodedResult: outcome.encodedResult,
    providerExecuted: false,
    preliminary: false,
  })
  return outcome.memoized === undefined ? result : Object.assign(result, { memoized: outcome.memoized })
})
export const domainFailureResult: {
  (outcome: DomainFailure): (call: AnyToolCall) => PendingToolResult
  (call: AnyToolCall, outcome: DomainFailure): PendingToolResult
} = Function.dual(
  2,
  (call: AnyToolCall, outcome: DomainFailure): PendingToolResult =>
    Response.toolResultPart({
      id: call.id,
      name: call.name,
      isFailure: true,
      result: outcome.failure,
      encodedResult: outcome.encodedFailure,
      providerExecuted: false,
      preliminary: false,
    }),
)
