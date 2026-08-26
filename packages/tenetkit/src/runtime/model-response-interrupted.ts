import { Pins, Session } from "tenetkit"
import { Schema } from "effect"
import type { InterruptedSessionEntry, ModelResponseInterrupted } from "./agent-event.js"
import { RuntimeUnavailable, SessionEntryCorrupt } from "./errors.js"
import { CompletedModelResponse, RunFailure } from "./run-event.js"
import { decodeAuthoredModelResponseContent } from "./model-response-content.js"
import type { OperationRecord } from "./sql/operations.js"
import type { ExecutionClaim, OperationCompletionOutcome } from "./run-store.js"

export interface PendingModelResponseInterrupted {
  readonly _tag: "ModelResponseInterrupted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly response: CompletedModelResponse
  readonly reason: "cancel" | "failure"
  readonly digest: string
}

export interface CommitInterruptedModelResponseInput extends ExecutionClaim {
  readonly runId: string
  readonly operationId: string
  readonly outcome: Extract<OperationCompletionOutcome, { readonly _tag: "Failed" }>
  readonly event: PendingModelResponseInterrupted
}

export interface ValidatedInterruptedModelResponse {
  readonly entry: InterruptedSessionEntry
  readonly event: ModelResponseInterrupted
}

const jsonValue = (value: unknown): unknown =>
  JSON.parse(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value))
const sameJson = (left: unknown, right: unknown): boolean =>
  Pins.digest(jsonValue(left)) === Pins.digest(jsonValue(right))
const fail = (message: string) => RuntimeUnavailable.make({ message })

const unsigned = (event: Omit<PendingModelResponseInterrupted, "digest">) => ({
  turn: event.turn,
  operationKey: event.operationKey,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  sessionParentId: event.sessionParentId,
  response: Schema.encodeSync(CompletedModelResponse)(event.response),
  reason: event.reason,
})

export const makeModelResponseInterrupted = (input: {
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly response: CompletedModelResponse
  readonly reason: "cancel" | "failure"
}): PendingModelResponseInterrupted => {
  const event = { _tag: "ModelResponseInterrupted" as const, ...input }
  return { ...event, digest: Pins.digest(jsonValue(unsigned(event))) }
}

export const interruptedSessionEntryId = (input: { readonly runId: string; readonly operationKey: string }): string =>
  `${input.runId}:model-response-interrupted:${input.operationKey}`

const interruptedSessionEntry = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly event: PendingModelResponseInterrupted
}): InterruptedSessionEntry | RuntimeUnavailable => {
  try {
    return {
      sessionId: input.sessionId,
      entryId: interruptedSessionEntryId({ runId: input.runId, operationKey: input.event.operationKey }),
      parentId: input.event.sessionParentId,
      content: decodeAuthoredModelResponseContent(
        Schema.encodeSync(CompletedModelResponse)(input.event.response).content,
      ),
      digest: input.event.digest,
    }
  } catch (error) {
    return fail(`interrupted model operation ${input.event.operationKey} response is invalid: ${String(error)}`)
  }
}

const durableEvent = (input: {
  readonly sessionId: string
  readonly entryId: string
  readonly event: PendingModelResponseInterrupted
}): ModelResponseInterrupted => ({
  _tag: "ModelResponseInterrupted",
  turn: input.event.turn,
  operationKey: input.event.operationKey,
  modelCallId: input.event.modelCallId,
  modelAttemptId: input.event.modelAttemptId,
  attempt: input.event.attempt,
  sessionId: input.sessionId,
  sessionParentId: input.event.sessionParentId,
  sessionEntryId: input.entryId,
  reason: input.event.reason,
  digest: input.event.digest,
  ...(input.event.response.usage === undefined ? {} : { usage: input.event.response.usage }),
  ...(input.event.response.finishReason === undefined ? {} : { finishReason: input.event.response.finishReason }),
})

export const validateInterruptedModelResponse = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly record: OperationRecord
  readonly outcome: { readonly _tag: "Failed"; readonly error: unknown }
  readonly event: PendingModelResponseInterrupted
}): ValidatedInterruptedModelResponse | RuntimeUnavailable => {
  const { event, outcome, record } = input
  if (record.kind !== "model" || record.operationKey !== event.operationKey) {
    return fail(`operation ${record.operationId} is not the active scheduled model operation`)
  }
  try {
    Schema.decodeUnknownSync(RunFailure)(outcome.error)
    Schema.encodeUnknownSync(CompletedModelResponse)(event.response)
  } catch (error) {
    return fail(`interrupted model operation ${event.operationKey} outcome or response is invalid: ${String(error)}`)
  }
  if (Pins.digest(jsonValue(unsigned(event))) !== event.digest) {
    return fail(`interrupted model operation ${event.operationKey} digest is corrupt`)
  }
  const entry = interruptedSessionEntry({ runId: input.runId, sessionId: input.sessionId, event })
  if (Schema.is(RuntimeUnavailable)(entry)) return entry
  return { entry, event: durableEvent({ sessionId: input.sessionId, entryId: entry.entryId, event }) }
}

export const sameInterruptedModelOutcome = (input: {
  readonly left: { readonly _tag: "Failed"; readonly error: unknown }
  readonly right: { readonly _tag: "Failed"; readonly error: unknown }
}): boolean => sameJson(input.left, input.right)

const durableUnsigned = (event: ModelResponseInterrupted) => ({
  _tag: event._tag,
  turn: event.turn,
  operationKey: event.operationKey,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  sessionId: event.sessionId,
  sessionParentId: event.sessionParentId,
  sessionEntryId: event.sessionEntryId,
  reason: event.reason,
  digest: event.digest,
  ...(event.usage === undefined
    ? {}
    : { usage: Schema.encodeSync(CompletedModelResponse)({ content: [], usage: event.usage }).usage! }),
  ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
})

export const sameInterruptedModelResponse = (input: {
  readonly left: ModelResponseInterrupted
  readonly right: ModelResponseInterrupted
}): boolean => sameJson(durableUnsigned(input.left), durableUnsigned(input.right))

export const resolveInterruptedModelResponse = (input: {
  readonly event: ModelResponseInterrupted
  readonly entry: Session.Entry
}): CompletedModelResponse | SessionEntryCorrupt => {
  const { entry, event } = input
  if (
    entry._tag !== "ModelResponse" ||
    entry.parentId !== event.sessionParentId ||
    entry.metadata?.interruptionDigest !== event.digest
  ) {
    return corruptReference(event)
  }
  try {
    const response = Schema.decodeUnknownSync(CompletedModelResponse)({
      content: Schema.encodeSync(Session.ModelResponseContent)(entry.content),
      ...(event.usage === undefined ? {} : { usage: event.usage }),
      ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
    })
    const pending: PendingModelResponseInterrupted = { ...event, response }
    if (Pins.digest(jsonValue(unsigned(pending))) !== event.digest) return corruptReference(event)
    return response
  } catch {
    return corruptReference(event)
  }
}

const corruptReference = (event: ModelResponseInterrupted) =>
  SessionEntryCorrupt.make({
    sessionId: event.sessionId,
    entryId: event.sessionEntryId,
    message: "Session interrupted model response reference does not match its entry",
  })
