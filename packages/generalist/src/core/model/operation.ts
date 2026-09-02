import { Schema } from "effect"
import { Prompt, Response, Tool } from "effect/unstable/ai"
import { ModelResponseContent } from "../context/session.js"
import type { CompletedModelResponse } from "./response/builder.js"

export { ModelResponseContent }

/** A completed model response encoded as one durable operation result. */
export interface CompletedModelOperation {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly replayFromHistory: boolean
  readonly content: typeof ModelResponseContent.Encoded
  readonly usage?: typeof Response.Usage.Encoded
  readonly finishReason?: Response.FinishReason
  readonly budgetCharge: number
  readonly digest: string
}

const CompletedModelOperationFields = Schema.Struct({
  operationId: Schema.String,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sessionParentId: Schema.NullOr(Schema.String),
  replayFromHistory: Schema.Boolean,
  content: Schema.toEncoded(ModelResponseContent),
  usage: Schema.optionalKey(Schema.toEncoded(Response.Usage)),
  finishReason: Schema.optionalKey(Response.FinishReason),
  budgetCharge: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER)),
  digest: Schema.String,
})

/** Schema for the JSON-only result recorded for one completed model operation. */
export const CompletedModelOperation = CompletedModelOperationFields

/** Returns whether an unknown journal result is a completed model operation. */
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
  readonly replayFromHistory: boolean
  readonly response: CompletedModelResponse<Record<string, Tool.Any>>
  readonly budgetCharge: number
}

/** @internal Values crossing the durable model stream boundary. */
export type AttemptEvent = AttemptPart | AttemptCompleted
