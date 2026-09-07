import type { DurabilityFailure } from "../../durability/errors.js"
import {
  type DriverCheckpoint,
  DriverError,
  type DriverOperation,
  type OperationOutcome,
} from "../../core/durable/driver.js"
import { withPending } from "../../core/durable/loop-driver.js"
import { RememberInput, type PendingOperation } from "../../core/durable/loop-driver-state.js"
import { Effect, Function, Option, Ref, Schema } from "effect"
import { digest } from "../../core/durable/canonical-json.js"

import { RuntimeUnavailable } from "../errors.js"
import type { ExecutionClaim, Service as RunStoreService } from "../run/store.js"
import type { WorkerMutationError } from "../run/store-types.js"
import type { ExecutionContinuation } from "../run/steering.js"
import type { OperationRecord } from "../operation/record.js"
import {
  completedOperationRefValue,
  liveModelResponseEvent,
  type LiveModelResponseCommitted,
} from "./model-response/commit.js"
import { hydrateCompletedOperation } from "./model-response/hydration.js"

const jsonValue = (value: LiveModelResponseCommitted): Schema.Json =>
  Schema.decodeSync(Schema.fromJsonString(Schema.Json))(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value))

const sameJson = (left: LiveModelResponseCommitted, right: LiveModelResponseCommitted): boolean => {
  try {
    return digest(jsonValue(left)) === digest(jsonValue(right))
  } catch {
    return false
  }
}

interface PreparedCompletion {
  readonly continuation?: ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
}

/** Commit the driver result through the model-specific atomic outbox or the generic operation path. */
export const commitDriverOperation = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly operation: DriverOperation
  readonly operationId: string
  readonly outcome: OperationOutcome
  readonly checkpoint: DriverCheckpoint
  readonly prepared: PreparedCompletion
}): Effect.Effect<OperationRecord, WorkerMutationError> => {
  const { store, claim, operation, operationId, outcome, checkpoint, prepared } = input
  if (operation.kind === "model" && outcome._tag === "Succeeded") {
    const event = liveModelResponseEvent(outcome.value)
    if (Schema.is(RuntimeUnavailable)(event)) return Effect.fail(event)
    // The response is durable, but the loop has not consumed it or checkpointed its tool batch yet.
    // Keep the replay cursor on this result; the next safe checkpoint advances it without redispatch.
    const { inputDigest: _, ...pending } = operation
    return store.commitModelResponse({
      ...claim,
      operationId,
      outcome,
      checkpoint: withPending(checkpoint, pending, checkpoint.turn),
      ...prepared,
      event,
    })
  }
  let completion: Parameters<RunStoreService["completeOperation"]>[0]["outcome"]
  if (outcome._tag === "Succeeded") completion = { _tag: "Succeeded", value: outcome.value }
  else if (outcome._tag === "Failed") completion = { _tag: "Failed", error: outcome.error }
  else completion = { _tag: "Unknown" }
  // Remember completes before the loop consumes its turn-end continuation. As with model
  // responses, keep that exact cursor durable until the next operation advances the loop.
  const { inputDigest: _inputDigest, ...pending } = operation
  const remember = operation.kind === "memory" && Schema.is(RememberInput)(operation.input)
  const replayCursor: PendingOperation = outcome._tag === "Succeeded" ? { ...pending, completed: true } : pending
  return store.completeOperation({
    ...claim,
    operationId,
    outcome: completion,
    checkpoint: remember ? withPending(checkpoint, replayCursor, checkpoint.turn) : checkpoint,
    ...prepared,
  })
}

/** Reconcile an ambiguous successful-model acknowledgement with one exact retry. */
export const commitDriverOperationWithReconciliation = (
  input: Parameters<typeof commitDriverOperation>[0],
): ReturnType<typeof commitDriverOperation> => {
  const commit = commitDriverOperation(input)
  return input.operation.kind === "model" && input.outcome._tag === "Succeeded"
    ? commit.pipe(Effect.catch(() => commitDriverOperation(input)))
    : commit
}

export const journalFailure: {
  (operationKey: string, cause: unknown): (phase: string) => DriverError
  (phase: string, operationKey: string, cause: unknown): DriverError
} = Function.dual(3, (phase: string, operationKey: string, cause: unknown) =>
  DriverError.make({ message: `Driver journal ${phase} failed for ${operationKey}`, cause }),
)

export const saveJournalCheckpoint = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly checkpoint: DriverCheckpoint
  readonly commandId: string
}): Effect.Effect<void, DriverError> =>
  input.store
    .saveExecution({ ...input.claim, commandId: input.commandId, checkpoint: input.checkpoint })
    .pipe(Effect.mapError((error) => journalFailure("checkpoint", input.claim.runId, error)))

export const hydratePersistedModelOperation = (input: {
  readonly store: RunStoreService
  readonly value: unknown
}): Effect.Effect<unknown, RuntimeUnavailable | DurabilityFailure> =>
  Effect.gen(function* () {
    const reference = completedOperationRefValue(input.value)
    if (reference === undefined)
      return yield* RuntimeUnavailable.make({ message: "persisted model result is not a reference" })
    const session = yield* input.store.sessionReader(reference.sessionId)
    if (Option.isNone(session)) {
      return yield* RuntimeUnavailable.make({ message: `Session ${reference.sessionId} is unavailable` })
    }
    return yield* hydrateCompletedOperation({ session: session.value, reference }).pipe(
      Effect.mapError((error) =>
        RuntimeUnavailable.make({
          message:
            error._tag === "generalist/runtime/SessionEntryCorrupt"
              ? error.message
              : `Session entry ${error.entryId} is missing from ${error.sessionId}`,
        }),
      ),
    )
  })

/** Verify Core's later live semantic event against the already committed transactional outbox. */
export const verifyCommittedModelEvent = (input: {
  readonly store: RunStoreService
  readonly claim: ExecutionClaim
  readonly event: LiveModelResponseCommitted
}): Effect.Effect<void, WorkerMutationError> =>
  Effect.gen(function* () {
    const persisted = yield* input.store.getOperationByKey({
      runId: input.claim.runId,
      operationKey: input.event.operationKey,
    })
    if (persisted === undefined || persisted.status !== "succeeded" || persisted.result === undefined)
      return yield* RuntimeUnavailable.make({
        message: `committed model operation ${input.event.operationKey} is missing`,
      })
    const reference = completedOperationRefValue(persisted.result)
    if (reference?.transitionDigest === undefined) {
      return yield* RuntimeUnavailable.make({
        message: `committed model operation ${input.event.operationKey} has no transition identity`,
      })
    }
    if (reference.operationId !== input.event.operationKey) {
      return yield* RuntimeUnavailable.make({
        message: `committed model operation ${input.event.operationKey} operation identity diverges`,
      })
    }
    if (reference.sessionId !== input.claim.session.sessionId) {
      return yield* RuntimeUnavailable.make({
        message: `committed model operation ${input.event.operationKey} session identity diverges`,
      })
    }
    const session = yield* input.store.sessionReader(reference.sessionId)
    if (Option.isNone(session)) {
      return yield* RuntimeUnavailable.make({
        message: `Session ${reference.sessionId} is unavailable`,
      })
    }
    const operation = yield* hydrateCompletedOperation({ session: session.value, reference }).pipe(
      Effect.mapError((error) =>
        RuntimeUnavailable.make({
          message:
            error._tag === "generalist/runtime/SessionEntryCorrupt"
              ? error.message
              : `Session entry ${error.entryId} is missing from ${error.sessionId}`,
        }),
      ),
    )
    const expected = liveModelResponseEvent(operation)
    if (Schema.is(RuntimeUnavailable)(expected) || !sameJson(expected, input.event)) {
      return yield* RuntimeUnavailable.make({
        message: `committed model operation ${input.event.operationKey} event identity diverges`,
      })
    }
  })

/** Release process-local completion bookkeeping after the durable store commit. */
export const clearDriverOperation = <A>(input: {
  readonly prepared: Ref.Ref<Map<string, A>>
  readonly active: Ref.Ref<ReadonlySet<string>>
  readonly completingRetrySafe: Ref.Ref<ReadonlySet<string>>
  readonly operationKey: string
  readonly operationId: string
}) =>
  Effect.all(
    [
      Ref.update(input.prepared, (current) => {
        const next = new Map(current)
        next.delete(input.operationKey)
        return next
      }),
      Ref.update(input.active, (current) => new Set([...current].filter((id) => id !== input.operationId))),
      Ref.update(
        input.completingRetrySafe,
        (current) => new Set([...current].filter((id) => id !== input.operationId)),
      ),
    ],
    { discard: true },
  )
