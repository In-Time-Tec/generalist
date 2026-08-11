import { Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import type { CompletedModelResponse } from "./model-response-builder.js"

const ToolCall = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
const ToolResult = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  isFailure: Schema.Boolean,
  result: Schema.Unknown,
  encodedResult: Schema.Unknown,
  providerExecuted: Schema.Boolean,
  preliminary: Schema.Boolean,
  metadata: Response.ProviderMetadata,
})
const ModelResponsePart = Schema.Union([
  Response.TextPart,
  Response.ReasoningPart,
  Response.ToolApprovalRequestPart,
  Response.FilePart,
  Response.DocumentSourcePart,
  Response.UrlSourcePart,
  Response.ResponseMetadataPart,
  Response.FinishPart,
  ToolCall,
  ToolResult,
])

/** @experimental Provider-agnostic semantic response content with no tool-specific Schema services. */
export const ModelResponseContent = Schema.Array(ModelResponsePart)

/** @experimental A completed model response encoded as one durable operation result. */
export interface CompletedModelOperation {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly messages: ReadonlyArray<Prompt.MessageEncoded>
  readonly content: typeof ModelResponseContent.Encoded
  readonly usage?: typeof Response.Usage.Encoded
  readonly finishReason?: Response.FinishReason
  readonly digest: string
}

const CompletedModelOperationFields = Schema.Struct({
  operationId: Schema.String,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sessionParentId: Schema.NullOr(Schema.String),
  messages: Schema.Array(Schema.toEncoded(Prompt.Message)),
  content: Schema.toEncoded(ModelResponseContent),
  usage: Schema.optionalKey(Schema.toEncoded(Response.Usage)),
  finishReason: Schema.optionalKey(Response.FinishReason),
  digest: Schema.String,
})

/** @experimental Schema for the JSON-only result recorded for one completed model operation. */
export const CompletedModelOperation = CompletedModelOperationFields

/** @experimental Returns whether an unknown journal result is a completed model operation. */
export const isCompletedModelOperation = Schema.is(CompletedModelOperation)

/** @internal One validated part emitted while a model attempt is live or replayed. */
export interface AttemptPart {
  readonly _tag: "Part"
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly part: Response.StreamPart<Record<string, Tool.Any>>
}

/** @internal The sole completion sentinel emitted after all validated model parts. */
export interface AttemptCompleted {
  readonly _tag: "Completed"
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly response: CompletedModelResponse<Record<string, Tool.Any>>
}

/** @internal Values crossing the durable model stream boundary. */
export type AttemptEvent = AttemptPart | AttemptCompleted
