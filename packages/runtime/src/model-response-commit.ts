import { Pins } from "@batonfx/core"
import { Schema } from "effect"
import { RuntimeUnavailable } from "./errors.js"
import type { ModelResponseCommitted } from "./agent-event.js"
import type { ExecutionClaim } from "./run-store.js"
import type { ExecutionCheckpoint } from "./execution-state.js"
import type { Prompt } from "effect/unstable/ai"
import { CompletedModelResponse } from "./run-event.js"
import type { OperationRecord } from "./sql/operations.js"

/** Atomic canonical model outcome and semantic Run outbox commit. */
export interface CommitModelResponseInput extends ExecutionClaim {
  readonly runId: string
  readonly operationId: string
  readonly outcome: { readonly _tag: "Succeeded"; readonly value: unknown }
  readonly checkpoint?: ExecutionCheckpoint
  readonly transcript?: Prompt.Prompt
  readonly continuation?: import("./steering.js").ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
  readonly event: ModelResponseCommitted
}

interface CompletedOperation {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly messages: unknown
  readonly content: unknown
  readonly usage?: unknown
  readonly finishReason?: unknown
  readonly digest: string
}

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))

const sameJson = (left: unknown, right: unknown): boolean =>
  Pins.digest(jsonValue(left)) === Pins.digest(jsonValue(right))

const operationValue = (value: unknown): CompletedOperation | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Partial<CompletedOperation>
  return typeof candidate.operationId === "string" &&
    typeof candidate.turn === "number" &&
    typeof candidate.modelCallId === "string" &&
    typeof candidate.modelAttemptId === "string" &&
    typeof candidate.attempt === "number" &&
    Array.isArray(candidate.messages) &&
    Array.isArray(candidate.content) &&
    typeof candidate.digest === "string"
    ? (candidate as CompletedOperation)
    : undefined
}

const fail = (message: string) => RuntimeUnavailable.make({ message })

/** Derive the sole semantic Run outbox from the canonical completed model operation. */
export const modelResponseEvent = (value: unknown): ModelResponseCommitted | RuntimeUnavailable => {
  const operation = operationValue(value)
  if (operation === undefined) return fail("model operation has an invalid completed result")
  const { digest, ...unsigned } = operation
  if (Pins.digest(jsonValue(unsigned)) !== digest) return fail("model operation result digest is corrupt")
  try {
    return {
      _tag: "ModelResponseCommitted",
      turn: operation.turn,
      operationKey: operation.operationId,
      modelCallId: operation.modelCallId,
      modelAttemptId: operation.modelAttemptId,
      attempt: operation.attempt,
      response: Schema.decodeUnknownSync(CompletedModelResponse)({
        content: operation.content,
        ...(operation.usage === undefined ? {} : { usage: operation.usage }),
        ...(operation.finishReason === undefined ? {} : { finishReason: operation.finishReason }),
      }) as unknown as ModelResponseCommitted["response"],
      digest,
    }
  } catch (error) {
    return fail(`model operation response is invalid: ${String(error)}`)
  }
}

/** Verify that the semantic outbox is an exact response copy of the canonical operation result. */
export const validateModelResponseCommit = (request: {
  readonly record: OperationRecord
  readonly input: CommitModelResponseInput
}): CompletedOperation | RuntimeUnavailable => {
  const { record, input } = request
  const operation = operationValue(input.outcome.value)
  if (operation === undefined) return fail(`model operation ${input.operationId} has an invalid completed result`)
  const { digest, ...unsigned } = operation
  if (Pins.digest(jsonValue(unsigned)) !== digest)
    return fail(`model operation ${input.operationId} result digest is corrupt`)
  if (record.kind !== "model" || record.operationId !== input.operationId)
    return fail(`operation ${input.operationId} is not the scheduled model operation`)
  if (record.operationKey !== input.event.operationKey || operation.operationId !== record.operationKey)
    return fail(`model operation ${input.operationId} outbox identity diverges from its scheduled operation`)
  if (
    operation.turn !== input.event.turn ||
    operation.modelCallId !== input.event.modelCallId ||
    operation.modelAttemptId !== input.event.modelAttemptId ||
    operation.attempt !== input.event.attempt ||
    digest !== input.event.digest
  )
    return fail(`model operation ${input.operationId} outbox identity or digest diverges from its result`)
  const encodedResponse = Schema.encodeSync(CompletedModelResponse)(input.event.response)
  const expectedResponse = {
    content: operation.content,
    ...(operation.usage === undefined ? {} : { usage: operation.usage }),
    ...(operation.finishReason === undefined ? {} : { finishReason: operation.finishReason }),
  }
  if (!sameJson(encodedResponse, expectedResponse))
    return fail(`model operation ${input.operationId} outbox response diverges from its result`)
  return operation
}

const payload = (event: ModelResponseCommitted) => ({
  _tag: event._tag,
  turn: event.turn,
  operationKey: event.operationKey,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  response: Schema.encodeSync(CompletedModelResponse)(event.response),
  digest: event.digest,
  ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
})

/** Exact retry check for an already committed semantic outbox. */
export const sameModelResponseEvent = (input: {
  readonly left: ModelResponseCommitted
  readonly right: ModelResponseCommitted
}): boolean => sameJson(payload(input.left), payload(input.right))
