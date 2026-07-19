/** @effect-diagnostics missingPipeableSignature:skip-file */
import { HashMap } from "effect"
import { Response } from "effect/unstable/ai"
import type { DomainFailure, Success } from "./tool-executor.js"

export type AnyToolCall = Response.ToolCallPart<string, unknown>

export type PendingToolResult = Response.ToolResultPart<string, unknown, unknown>

export interface ToolCallIdState {
  readonly nextIndex: number
  readonly firstIndexes: HashMap.HashMap<string, number>
}

export const successResult = (call: AnyToolCall, outcome: Success): PendingToolResult =>
  Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: false,
    result: outcome.result,
    encodedResult: outcome.encodedResult,
    providerExecuted: false,
    preliminary: false,
  })

export const domainFailureResult = (call: AnyToolCall, outcome: DomainFailure): PendingToolResult =>
  Response.toolResultPart({
    id: call.id,
    name: call.name,
    isFailure: true,
    result: outcome.failure,
    encodedResult: outcome.encodedFailure,
    providerExecuted: false,
    preliminary: false,
  })
