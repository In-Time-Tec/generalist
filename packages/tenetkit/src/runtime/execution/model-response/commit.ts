import { AgentEvent } from "../../../core/agent/public/event.js"
import { Pins } from "../../../core/index.js"
import { Session } from "../../../core/context/public/session.js"
import { CompletedModelOperation } from "../../../core/model/operation.js"
import { Effect, Option, Schema } from "effect"
import { Response } from "effect/unstable/ai"
import { RuntimeUnavailable, SessionEntryCorrupt, SessionEntryNotFound } from "../../errors.js"
import type { ModelResponseCommitted } from "../agent/event.js"
import type { ExecutionClaim } from "../../run/store.js"
import type { ExecutionCheckpoint } from "../state.js"
import { CompletedModelResponse } from "../../run/event.js"
import { decodeAuthoredModelResponseContent } from "./content.js"
import type { OperationRecord } from "../../sql/operations.js"

export type LiveModelResponseCommitted = Extract<AgentEvent.Event, { readonly _tag: "ModelResponseCommitted" }>

export interface CommitModelResponseInput extends ExecutionClaim {
  readonly runId: string
  readonly operationId: string
  readonly outcome: { readonly _tag: "Succeeded"; readonly value: unknown }
  readonly checkpoint?: ExecutionCheckpoint
  readonly continuation?: import("../../run/steering.js").ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
  readonly event: LiveModelResponseCommitted
}

export type CompletedOperation = CompletedModelOperation

export interface CompletedOperationRef {
  readonly operationId: string
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionId: string
  readonly sessionParentId: string | null
  readonly sessionEntryId: string
  readonly usage?: (typeof CompletedModelResponse.Encoded)["usage"]
  readonly finishReason?: (typeof CompletedModelResponse.Encoded)["finishReason"]
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

type JsonInput = typeof Schema.Unknown.Type
const JsonFromString = Schema.fromJsonString(Schema.Json)
const UnknownFromString = Schema.fromJsonString(Schema.Unknown)
const jsonValue = (value: JsonInput): Schema.Json =>
  Schema.decodeSync(JsonFromString)(Schema.encodeSync(UnknownFromString)(value))
const sameJson = <Left, Right>(left: Left, right: Right): boolean =>
  Pins.digest(jsonValue(left)) === Pins.digest(jsonValue(right))
const fail = (message: string) => RuntimeUnavailable.make({ message })
const committedTag: ModelResponseCommitted["_tag"] = "ModelResponseCommitted"

type PersistedOperationValue = CommitModelResponseInput["outcome"]["value"]

const operationValue = (value: PersistedOperationValue): CompletedOperation | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(CompletedModelOperation, { onExcessProperty: "error" })(value))

const CompletedOperationRefValue = Schema.Struct({
  operationId: Schema.String,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sessionId: Schema.String,
  sessionParentId: Schema.NullOr(Schema.String),
  sessionEntryId: Schema.String,
  usage: Schema.optionalKey(Schema.toEncoded(Response.Usage)),
  finishReason: Schema.optionalKey(Response.FinishReason),
  digest: Schema.String,
})

export const completedOperationRefValue = (value: PersistedOperationValue): CompletedOperationRef | undefined =>
  Option.getOrUndefined(Schema.decodeUnknownOption(CompletedOperationRefValue, { onExcessProperty: "error" })(value))

export const completedSessionEntryId = (input: { readonly runId: string; readonly operationKey: string }): string =>
  `${input.runId}:model-response-committed:${input.operationKey}`

const referenceFromOperation = (input: {
  readonly runId: string
  readonly sessionId: string
  readonly operation: CompletedOperation
}): CompletedOperationRef =>
  Object.assign(
    {
      operationId: input.operation.operationId,
      turn: input.operation.turn,
      modelCallId: input.operation.modelCallId,
      modelAttemptId: input.operation.modelAttemptId,
      attempt: input.operation.attempt,
      sessionId: input.sessionId,
      sessionParentId: input.operation.sessionParentId,
      sessionEntryId: completedSessionEntryId({ runId: input.runId, operationKey: input.operation.operationId }),
      digest: input.operation.digest,
    },
    input.operation.usage === undefined ? undefined : { usage: input.operation.usage },
    input.operation.finishReason === undefined ? undefined : { finishReason: input.operation.finishReason },
  )

const unsignedOperation = (input: {
  readonly reference: CompletedOperationRef
  readonly content: CompletedOperation["content"]
}): Omit<CompletedOperation, "digest"> => {
  const operation: Omit<CompletedOperation, "digest"> = {
    operationId: input.reference.operationId,
    turn: input.reference.turn,
    modelCallId: input.reference.modelCallId,
    modelAttemptId: input.reference.modelAttemptId,
    attempt: input.reference.attempt,
    sessionParentId: input.reference.sessionParentId,
    replayFromHistory: false,
    content: input.content,
  }
  if (input.reference.usage !== undefined) Object.assign(operation, { usage: input.reference.usage })
  if (input.reference.finishReason !== undefined)
    Object.assign(operation, { finishReason: input.reference.finishReason })
  return operation
}

const contentFromResponse = (response: LiveModelResponseCommitted["response"]): CompletedOperation["content"] =>
  Schema.encodeSync(CompletedModelResponse)(response).content

const operationFromReference = (input: {
  readonly reference: CompletedOperationRef
  readonly content: CompletedOperation["content"]
}): CompletedOperation | RuntimeUnavailable => {
  const unsigned = unsignedOperation(input)
  if (Pins.digest(jsonValue(unsigned)) !== input.reference.digest) {
    return fail(`model operation ${input.reference.operationId} result digest is corrupt`)
  }
  return { ...unsigned, digest: input.reference.digest }
}

export const liveModelResponseEvent = (
  value: PersistedOperationValue,
): LiveModelResponseCommitted | RuntimeUnavailable => {
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
      response: resolvedModelResponse(operation),
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

const eventFromReference = (reference: CompletedOperationRef): ModelResponseCommitted =>
  Object.assign(
    {
      _tag: committedTag,
      turn: reference.turn,
      operationKey: reference.operationId,
      modelCallId: reference.modelCallId,
      modelAttemptId: reference.modelAttemptId,
      attempt: reference.attempt,
      sessionId: reference.sessionId,
      sessionParentId: reference.sessionParentId,
      sessionEntryId: reference.sessionEntryId,
      digest: reference.digest,
    },
    reference.usage === undefined
      ? undefined
      : { usage: Schema.decodeSync(CompletedModelResponse)({ content: [], usage: reference.usage }).usage! },
    reference.finishReason === undefined ? undefined : { finishReason: reference.finishReason },
  )

const validateReference = (input: {
  readonly reference: CompletedOperationRef
  readonly record: OperationRecord
  readonly request: CommitModelResponseInput
  readonly sessionId: string
}): RuntimeUnavailable | undefined => {
  if (input.reference.sessionId !== input.sessionId) {
    return fail(`model operation ${input.request.operationId} session identity diverges`)
  }
  const entryId = completedSessionEntryId({ runId: input.request.runId, operationKey: input.record.operationKey })
  if (input.reference.sessionEntryId !== entryId) {
    return fail(`model operation ${input.request.operationId} Session entry identity diverges`)
  }
  return undefined
}

const validateOperationIdentity = (input: {
  readonly operation: CompletedOperation
  readonly record: OperationRecord
  readonly request: CommitModelResponseInput
}): RuntimeUnavailable | undefined => {
  const { operation, record, request } = input
  if (record.operationKey !== request.event.operationKey || operation.operationId !== record.operationKey) {
    return fail(`model operation ${request.operationId} outbox identity diverges from its scheduled operation`)
  }
  if (
    operation.turn !== request.event.turn ||
    operation.modelCallId !== request.event.modelCallId ||
    operation.modelAttemptId !== request.event.modelAttemptId ||
    operation.attempt !== request.event.attempt ||
    operation.digest !== request.event.digest
  ) {
    return fail(`model operation ${request.operationId} outbox identity or digest diverges from its result`)
  }
  return undefined
}

const commitSource = (input: {
  readonly record: OperationRecord
  readonly request: CommitModelResponseInput
  readonly sessionId: string
}): readonly [CompletedOperation | undefined, CompletedOperationRef] | RuntimeUnavailable => {
  const rich = operationValue(input.request.outcome.value)
  const persisted = completedOperationRefValue(input.request.outcome.value)
  if (rich === undefined && persisted === undefined) {
    return fail(`model operation ${input.request.operationId} has an invalid completed result`)
  }
  if (rich === undefined && input.record.status !== "succeeded") {
    return fail(`model operation ${input.request.operationId} first commit must carry the authored response`)
  }
  const reference =
    rich === undefined
      ? persisted!
      : referenceFromOperation({ runId: input.request.runId, sessionId: input.sessionId, operation: rich })
  return [rich, reference]
}

export const validateModelResponseCommit = (request: {
  readonly record: OperationRecord
  readonly input: CommitModelResponseInput
  readonly sessionId: string
}): ValidatedModelResponseCommit | RuntimeUnavailable => {
  const { record, input, sessionId } = request
  if (record.kind !== "model" || record.operationId !== input.operationId) {
    return fail(`operation ${input.operationId} is not the scheduled model operation`)
  }
  const source = commitSource({ record, request: input, sessionId })
  if (Schema.is(RuntimeUnavailable)(source)) return source
  const [rich, reference] = source
  const referenceFailure = validateReference({ reference, record, request: input, sessionId })
  if (referenceFailure !== undefined) return referenceFailure
  const operation = rich ?? operationFromReference({ reference, content: contentFromResponse(input.event.response) })
  if (Schema.is(RuntimeUnavailable)(operation)) return operation
  const { digest, ...unsigned } = operation
  if (Pins.digest(jsonValue(unsigned)) !== digest)
    return fail(`model operation ${input.operationId} result digest is corrupt`)
  const identityFailure = validateOperationIdentity({ operation, record, request: input })
  if (identityFailure !== undefined) return identityFailure
  const expectedResponse = Object.assign(
    {
      content: operation.content,
    },
    operation.usage === undefined ? undefined : { usage: operation.usage },
    operation.finishReason === undefined ? undefined : { finishReason: operation.finishReason },
  )
  if (!sameJson(Schema.encodeSync(CompletedModelResponse)(input.event.response), expectedResponse)) {
    return fail(`model operation ${input.operationId} live response diverges from its result`)
  }
  const entry = sessionEntryFromOperation({ reference, operation })
  if (Schema.is(RuntimeUnavailable)(entry)) return entry
  return { operation, reference, entry, event: eventFromReference(reference) }
}

const eventPayload = (event: ModelResponseCommitted) =>
  Object.assign(
    {
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
    },
    event.usage === undefined
      ? undefined
      : { usage: Schema.encodeSync(CompletedModelResponse)({ content: [], usage: event.usage }).usage! },
    event.finishReason === undefined ? undefined : { finishReason: event.finishReason },
    event.metadata === undefined ? undefined : { metadata: event.metadata },
  )

export const sameModelResponseEvent = (input: {
  readonly left: ModelResponseCommitted
  readonly right: ModelResponseCommitted
}): boolean => sameJson(eventPayload(input.left), eventPayload(input.right))

export const referenceFromEvent = (event: ModelResponseCommitted): CompletedOperationRef =>
  Object.assign(
    {
      operationId: event.operationKey,
      turn: event.turn,
      modelCallId: event.modelCallId,
      modelAttemptId: event.modelAttemptId,
      attempt: event.attempt,
      sessionId: event.sessionId,
      sessionParentId: event.sessionParentId,
      sessionEntryId: event.sessionEntryId,
      digest: event.digest,
    },
    event.usage === undefined
      ? undefined
      : { usage: Schema.encodeSync(CompletedModelResponse)({ content: [], usage: event.usage }).usage! },
    event.finishReason === undefined ? undefined : { finishReason: event.finishReason },
  )

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

export const resolvedModelResponse = (operation: CompletedOperation): LiveModelResponseCommitted["response"] => {
  const { content: _, ...response } = Schema.decodeSync(CompletedModelResponse)(
    Object.assign(
      {
        content: operation.content,
      },
      operation.usage === undefined ? undefined : { usage: operation.usage },
      operation.finishReason === undefined ? undefined : { finishReason: operation.finishReason },
    ),
  )
  return { ...response, content: decodeAuthoredModelResponseContent(operation.content) }
}
