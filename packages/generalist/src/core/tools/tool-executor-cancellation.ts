import { Function, Option, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import type { Service } from "./tool-executor.js"
import type { DomainFailure, Request, Success } from "./tool-result-codec.js"

/** @experimental A completed tool outcome reported while cancelling an exact durable operation. */
export type TerminalOutcome = Success | DomainFailure

/** @experimental Stable identity for semantic cancellation of one admitted tool operation. */
export interface CancellationRequest {
  readonly operationKey: string
  readonly attempt: number
  readonly sessionId: string
  readonly runId: string
  readonly rootRunId: string
  readonly toolCallId: string
  readonly toolName: string
  readonly execution: Request
}

/** @experimental A definitive executor/provider acknowledgement of semantic cancellation. */
export type CancellationOutcome =
  | { readonly _tag: "Cancelled" }
  | { readonly _tag: "AlreadyTerminal"; readonly outcome: TerminalOutcome }

/** @experimental A concrete executor could not definitively cancel one admitted operation. */
export class CancellationFailure extends Schema.TaggedError<CancellationFailure>()(
  "generalist/core/CancellationFailure",
  {
    tool: Schema.String,
    message: Schema.String,
  },
) {}

const PersistedToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  "~effect/ai/Content/Part": Schema.Literal("~effect/ai/Content/Part"),
  metadata: Response.ProviderMetadata,
})

const PersistedRequest = Schema.Struct({
  call: PersistedToolCall,
  toolCallBatch: Schema.Struct({ calls: Schema.Array(PersistedToolCall) }),
  turn: Schema.Int,
  toolCallIndex: Schema.Int,
  agentName: Schema.String,
  sessionId: Schema.String,
})

const CancellableOperation = Schema.TaggedStruct("CancellableTool", {
  execution: PersistedRequest,
})

export const cancellableOperation = (execution: Request) => ({ _tag: "CancellableTool" as const, execution })

export const decodeCancellableOperation = (input: typeof Schema.Unknown.Type): Request | undefined =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CancellableOperation)(input, { onExcessProperty: "preserve" }).pipe(
      Option.map((decoded) => decoded.execution),
    ),
  )

export const supportsCancellation: {
  (request: Request): (executor: Service) => boolean
  (executor: Service, request: Request): boolean
} = Function.dual(
  2,
  (executor: Service, request: Request): boolean =>
    executor.cancel !== undefined && (executor.cancellable?.(request) ?? true),
)
