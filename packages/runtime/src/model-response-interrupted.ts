import { Pins } from "@batonfx/core"
import { Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import type { InterruptedSessionEntry, ModelResponseInterrupted } from "./agent-event.js"
import { RuntimeUnavailable } from "./errors.js"
import { CompletedModelResponse, RunFailure } from "./run-event.js"
import type { OperationRecord } from "./sql/operations.js"
import type { ExecutionClaim, OperationCompletionOutcome } from "./run-store.js"

/** Atomic interrupted model outcome, Session projection, and semantic Run outbox commit. */
export interface CommitInterruptedModelResponseInput extends ExecutionClaim {
  readonly runId: string
  readonly operationId: string
  readonly outcome: Extract<OperationCompletionOutcome, { readonly _tag: "Failed" }>
  readonly event: ModelResponseInterrupted
}

const jsonValue = (value: unknown): unknown => JSON.parse(Schema.encodeSync(Schema.UnknownFromJsonString)(value))
const sameJson = (left: unknown, right: unknown): boolean =>
  Pins.digest(jsonValue(left)) === Pins.digest(jsonValue(right))
const fail = (message: string) => RuntimeUnavailable.make({ message })

const unsigned = (event: Omit<ModelResponseInterrupted, "digest">) => ({
  turn: event.turn,
  operationKey: event.operationKey,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  response: Schema.encodeSync(CompletedModelResponse)(event.response),
  reason: event.reason,
})

/** Build the canonical interrupted model outcome from Core's normalized accumulator snapshot. */
export const makeModelResponseInterrupted = (input: {
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly response: ModelResponseInterrupted["response"]
  readonly reason: ModelResponseInterrupted["reason"]
}): ModelResponseInterrupted => {
  const event = { _tag: "ModelResponseInterrupted" as const, ...input }
  return { ...event, digest: Pins.digest(jsonValue(unsigned(event))) }
}

export const interruptedSessionEntryId = (input: { readonly runId: string; readonly operationKey: string }): string =>
  `${input.runId}:model-response-interrupted:${input.operationKey}`

/** Derive the exact assistant Session projection from the same normalized response as the Run event. */
export const interruptedSessionEntry = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly event: ModelResponseInterrupted
}): InterruptedSessionEntry | RuntimeUnavailable => {
  const prompt = Prompt.fromResponseParts(input.event.response.content as ReadonlyArray<Response.AnyPart>)
  const message = prompt.content[0]
  if (prompt.content.length !== 1 || message?.role !== "assistant") {
    return fail(`interrupted model operation ${input.event.operationKey} did not project one assistant message`)
  }
  return {
    sessionId: input.sessionId,
    entryId: interruptedSessionEntryId({ runId: input.runId, operationKey: input.event.operationKey }),
    message,
    digest: input.event.digest,
  }
}

export const validateInterruptedModelResponse = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly record: OperationRecord
  readonly outcome: { readonly _tag: "Failed"; readonly error: unknown }
  readonly event: ModelResponseInterrupted
}): InterruptedSessionEntry | RuntimeUnavailable => {
  const { event, outcome, record } = input
  if (record.kind !== "model" || record.operationKey !== event.operationKey) {
    return fail(`operation ${record.operationId} is not the active scheduled model operation`)
  }
  try {
    Schema.decodeUnknownSync(RunFailure)(outcome.error)
    Schema.decodeUnknownSync(CompletedModelResponse)(event.response)
  } catch (error) {
    return fail(`interrupted model operation ${event.operationKey} outcome or response is invalid: ${String(error)}`)
  }
  if (Pins.digest(jsonValue(unsigned(event))) !== event.digest) {
    return fail(`interrupted model operation ${event.operationKey} digest is corrupt`)
  }
  return interruptedSessionEntry({ runId: input.runId, sessionId: input.sessionId, event })
}

export const sameInterruptedModelOutcome = (input: {
  readonly left: { readonly _tag: "Failed"; readonly error: unknown }
  readonly right: { readonly _tag: "Failed"; readonly error: unknown }
}): boolean => sameJson(input.left, input.right)

export const sameInterruptedModelResponse = (input: {
  readonly left: ModelResponseInterrupted
  readonly right: ModelResponseInterrupted
}): boolean =>
  input.left._tag === input.right._tag &&
  input.left.digest === input.right.digest &&
  sameJson(unsigned(input.left), unsigned(input.right))
