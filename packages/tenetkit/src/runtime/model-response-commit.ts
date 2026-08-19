import { AgentEvent, Pins, Session } from "tenetkit"
import { Effect, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { RuntimeUnavailable, SessionEntryCorrupt, SessionEntryNotFound } from "./errors.js"
import type { ModelResponseCommitted } from "./agent-event.js"
import type { ExecutionClaim } from "./run-store.js"
import type { ExecutionCheckpoint } from "./execution-state.js"
import { CompletedModelResponse } from "./run-event.js"
import { decodeAuthoredModelResponseContent } from "./model-response-content.js"
import type { OperationRecord } from "./sql/operations.js"

export type LiveModelResponseCommitted = Extract<AgentEvent.Event, { readonly _tag: "ModelResponseCommitted" }>

export interface CommitModelResponseInput extends ExecutionClaim {
  readonly runId: string
  readonly operationId: string
  readonly outcome: { readonly _tag: "Succeeded"; readonly value: unknown }
  readonly checkpoint?: ExecutionCheckpoint
  readonly continuation?: import("./steering.js").ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
  readonly event: LiveModelResponseCommitted
}

export interface CompletedOperation {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionParentId: string | null
  readonly content: unknown
  readonly usage?: unknown
  readonly finishReason?: unknown
  readonly digest: string
}

export interface CompletedOperationRef {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionId: string
  readonly sessionParentId: string | null
  readonly sessionEntryId: string
  readonly usage?: unknown
  readonly finishReason?: unknown
  readonly digest: string
}

export interface CompletedSessionEntry {
  readonly sessionId: string
  readonly entryId: string
  readonly parentId: string | null
  readonly content: Session.ModelResponseEntry["content"]
  readonly digest: string
}

export interface ValidatedModelResponseCommit {
  readonly operation: CompletedOperation
  readonly reference: CompletedOperationRef
  readonly entry: CompletedSessionEntry
  readonly event: ModelResponseCommitted
}

const jsonValue = (value: unknown): unknown =>
  JSON.parse(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value))
const sameJson = (left: unknown, right: unknown): boolean =>
  Pins.digest(jsonValue(left)) === Pins.digest(jsonValue(right))
const fail = (message: string) => RuntimeUnavailable.make({ message })

const operationValue = (value: unknown): CompletedOperation | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Partial<CompletedOperation>
  return typeof candidate.operationId === "string" &&
    typeof candidate.turn === "number" &&
    typeof candidate.modelCallId === "string" &&
    typeof candidate.modelAttemptId === "string" &&
    typeof candidate.attempt === "number" &&
    (candidate.sessionParentId === null || typeof candidate.sessionParentId === "string") &&
    Array.isArray(candidate.content) &&
    typeof candidate.digest === "string"
    ? (candidate as CompletedOperation)
    : undefined
}

export const completedOperationRefValue = (value: unknown): CompletedOperationRef | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Partial<CompletedOperationRef>
  return typeof candidate.operationId === "string" &&
    typeof candidate.turn === "number" &&
    typeof candidate.modelCallId === "string" &&
    typeof candidate.modelAttemptId === "string" &&
    typeof candidate.attempt === "number" &&
    typeof candidate.sessionId === "string" &&
    (candidate.sessionParentId === null || typeof candidate.sessionParentId === "string") &&
    typeof candidate.sessionEntryId === "string" &&
    !("content" in candidate) &&
    typeof candidate.digest === "string"
    ? (candidate as CompletedOperationRef)
    : undefined
}

export const completedSessionEntryId = (input: { readonly runId: string; readonly operationKey: string }): string =>
  `${input.runId}:model-response-committed:${input.operationKey}`

const referenceFromOperation = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly operation: CompletedOperation
}): CompletedOperationRef => ({
  operationId: input.operation.operationId,
  turn: input.operation.turn,
  modelCallId: input.operation.modelCallId,
  modelAttemptId: input.operation.modelAttemptId,
  attempt: input.operation.attempt,
  sessionId: input.sessionId,
  sessionParentId: input.operation.sessionParentId,
  sessionEntryId: completedSessionEntryId({ runId: input.runId, operationKey: input.operation.operationId }),
  ...(input.operation.usage === undefined ? {} : { usage: input.operation.usage }),
  ...(input.operation.finishReason === undefined ? {} : { finishReason: input.operation.finishReason }),
  digest: input.operation.digest,
})

const unsignedOperation = (input: { readonly reference: CompletedOperationRef; readonly content: unknown }) => ({
  operationId: input.reference.operationId,
  turn: input.reference.turn,
  modelCallId: input.reference.modelCallId,
  modelAttemptId: input.reference.modelAttemptId,
  attempt: input.reference.attempt,
  sessionParentId: input.reference.sessionParentId,
  replayFromHistory: false,
  content: input.content,
  ...(input.reference.usage === undefined ? {} : { usage: input.reference.usage }),
  ...(input.reference.finishReason === undefined ? {} : { finishReason: input.reference.finishReason }),
})

const contentFromResponse = (response: LiveModelResponseCommitted["response"]): unknown =>
  Schema.encodeSync(CompletedModelResponse)(response).content

const operationFromReference = (input: {
  readonly reference: CompletedOperationRef
  readonly content: unknown
}): CompletedOperation | RuntimeUnavailable => {
  const unsigned = unsignedOperation(input)
  if (Pins.digest(jsonValue(unsigned)) !== input.reference.digest) {
    return fail(`model operation ${input.reference.operationId} result digest is corrupt`)
  }
  return { ...unsigned, digest: input.reference.digest }
}

export const liveModelResponseEvent = (value: unknown): LiveModelResponseCommitted | RuntimeUnavailable => {
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
      response: resolvedModelResponse(operation) as LiveModelResponseCommitted["response"],
      digest,
    }
  } catch (error) {
    return fail(`model operation response is invalid: ${String(error)}`)
  }
}

const sessionEntryFromOperation = (input: {
  readonly reference: CompletedOperationRef
  readonly operation: CompletedOperation
}): CompletedSessionEntry | RuntimeUnavailable => {
  try {
    return {
      sessionId: input.reference.sessionId,
      entryId: input.reference.sessionEntryId,
      parentId: input.reference.sessionParentId,
      content: decodeAuthoredModelResponseContent(input.operation.content),
      digest: input.reference.digest,
    }
  } catch (error) {
    return fail(`model operation ${input.operation.operationId} response is invalid: ${String(error)}`)
  }
}

const eventFromReference = (reference: CompletedOperationRef): ModelResponseCommitted => ({
  _tag: "ModelResponseCommitted",
  turn: reference.turn,
  operationKey: reference.operationId,
  modelCallId: reference.modelCallId,
  modelAttemptId: reference.modelAttemptId,
  attempt: reference.attempt,
  sessionId: reference.sessionId,
  sessionParentId: reference.sessionParentId,
  sessionEntryId: reference.sessionEntryId,
  digest: reference.digest,
  ...(reference.usage === undefined
    ? {}
    : {
        usage: Schema.decodeUnknownSync(CompletedModelResponse)({ content: [], usage: reference.usage }).usage!,
      }),
  ...(reference.finishReason === undefined ? {} : { finishReason: reference.finishReason as Response.FinishReason }),
})

export const validateModelResponseCommit = (request: {
  readonly record: OperationRecord
  readonly input: CommitModelResponseInput
  readonly sessionId: string
}): ValidatedModelResponseCommit | RuntimeUnavailable => {
  const { record, input, sessionId } = request
  if (record.kind !== "model" || record.operationId !== input.operationId) {
    return fail(`operation ${input.operationId} is not the scheduled model operation`)
  }
  const rich = operationValue(input.outcome.value)
  const persisted = completedOperationRefValue(input.outcome.value)
  if (rich === undefined && persisted === undefined) {
    return fail(`model operation ${input.operationId} has an invalid completed result`)
  }
  if (rich === undefined && record.status !== "succeeded") {
    return fail(`model operation ${input.operationId} first commit must carry the authored response`)
  }
  const reference =
    rich === undefined ? persisted! : referenceFromOperation({ runId: input.runId, sessionId, operation: rich })
  if (reference.sessionId !== sessionId) return fail(`model operation ${input.operationId} session identity diverges`)
  if (reference.sessionEntryId !== completedSessionEntryId({ runId: input.runId, operationKey: record.operationKey })) {
    return fail(`model operation ${input.operationId} Session entry identity diverges`)
  }
  const operation = rich ?? operationFromReference({ reference, content: contentFromResponse(input.event.response) })
  if (Schema.is(RuntimeUnavailable)(operation)) return operation
  const { digest, ...unsigned } = operation
  if (Pins.digest(jsonValue(unsigned)) !== digest)
    return fail(`model operation ${input.operationId} result digest is corrupt`)
  if (record.operationKey !== input.event.operationKey || operation.operationId !== record.operationKey) {
    return fail(`model operation ${input.operationId} outbox identity diverges from its scheduled operation`)
  }
  if (
    operation.turn !== input.event.turn ||
    operation.modelCallId !== input.event.modelCallId ||
    operation.modelAttemptId !== input.event.modelAttemptId ||
    operation.attempt !== input.event.attempt ||
    digest !== input.event.digest
  ) {
    return fail(`model operation ${input.operationId} outbox identity or digest diverges from its result`)
  }
  const expectedResponse = {
    content: operation.content,
    ...(operation.usage === undefined ? {} : { usage: operation.usage }),
    ...(operation.finishReason === undefined ? {} : { finishReason: operation.finishReason }),
  }
  if (!sameJson(Schema.encodeSync(CompletedModelResponse)(input.event.response), expectedResponse)) {
    return fail(`model operation ${input.operationId} live response diverges from its result`)
  }
  const entry = sessionEntryFromOperation({ reference, operation })
  if (Schema.is(RuntimeUnavailable)(entry)) return entry
  return { operation, reference, entry, event: eventFromReference(reference) }
}

const eventPayload = (event: ModelResponseCommitted) => ({
  _tag: event._tag,
  turn: event.turn,
  operationKey: event.operationKey,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  sessionId: event.sessionId,
  sessionParentId: event.sessionParentId,
  sessionEntryId: event.sessionEntryId,
  digest: event.digest,
  ...(event.usage === undefined
    ? {}
    : { usage: Schema.encodeSync(CompletedModelResponse)({ content: [], usage: event.usage }).usage! }),
  ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
  ...(event.metadata === undefined ? {} : { metadata: event.metadata }),
})

export const sameModelResponseEvent = (input: {
  readonly left: ModelResponseCommitted
  readonly right: ModelResponseCommitted
}): boolean => sameJson(eventPayload(input.left), eventPayload(input.right))

export const referenceFromEvent = (event: ModelResponseCommitted): CompletedOperationRef => ({
  operationId: event.operationKey,
  turn: event.turn,
  modelCallId: event.modelCallId,
  modelAttemptId: event.modelAttemptId,
  attempt: event.attempt,
  sessionId: event.sessionId,
  sessionParentId: event.sessionParentId,
  sessionEntryId: event.sessionEntryId,
  ...(event.usage === undefined
    ? {}
    : { usage: Schema.encodeSync(CompletedModelResponse)({ content: [], usage: event.usage }).usage! }),
  ...(event.finishReason === undefined ? {} : { finishReason: event.finishReason }),
  digest: event.digest,
})

export const hydrateCompletedOperation = (input: {
  readonly session: Session.Interface
  readonly reference: CompletedOperationRef
}): Effect.Effect<CompletedOperation, SessionEntryNotFound | SessionEntryCorrupt> =>
  Effect.gen(function* () {
    const path = yield* input.session.path(input.reference.sessionEntryId).pipe(
      Effect.mapError((error) =>
        error.message.includes("does not exist")
          ? SessionEntryNotFound.make({
              sessionId: input.reference.sessionId,
              entryId: input.reference.sessionEntryId,
            })
          : SessionEntryCorrupt.make({
              sessionId: input.reference.sessionId,
              entryId: input.reference.sessionEntryId,
              message: error.message,
            }),
      ),
      Effect.catchDefect((defect) =>
        Effect.fail(
          SessionEntryCorrupt.make({
            sessionId: input.reference.sessionId,
            entryId: input.reference.sessionEntryId,
            message: `Session entry could not be decoded: ${String(defect)}`,
          }),
        ),
      ),
    )
    const entry = path.at(-1)
    if (entry?.id !== input.reference.sessionEntryId) {
      return yield* SessionEntryNotFound.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
      })
    }
    if (
      entry._tag !== "ModelResponse" ||
      entry.parentId !== input.reference.sessionParentId ||
      entry.metadata?.modelResponseDigest !== input.reference.digest
    ) {
      return yield* SessionEntryCorrupt.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
        message: "Session model response reference does not match its entry",
      })
    }
    const content = yield* Schema.encodeEffect(Session.ModelResponseContent)(entry.content).pipe(
      Effect.mapError((error) =>
        SessionEntryCorrupt.make({
          sessionId: input.reference.sessionId,
          entryId: input.reference.sessionEntryId,
          message: `Session model response content is corrupt: ${String(error)}`,
        }),
      ),
    )
    const operation = operationFromReference({ reference: input.reference, content })
    if (Schema.is(RuntimeUnavailable)(operation)) {
      return yield* SessionEntryCorrupt.make({
        sessionId: input.reference.sessionId,
        entryId: input.reference.sessionEntryId,
        message: operation.message,
      })
    }
    return operation
  })

export const resolvedModelResponse = (operation: CompletedOperation): CompletedModelResponse =>
  Schema.decodeUnknownSync(CompletedModelResponse)({
    content: operation.content,
    ...(operation.usage === undefined ? {} : { usage: operation.usage }),
    ...(operation.finishReason === undefined ? {} : { finishReason: operation.finishReason }),
  })
