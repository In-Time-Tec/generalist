import { DurableDriver } from "../../core/durable/public/driver.js"
import { Effect, Function, Option, Ref, Schema } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import type { ExecutionClaim, Interface as RunStoreInterface } from "../run/store.js"
import type { WorkerMutationError } from "../run/store-types.js"
import type { ExecutionContinuation } from "../run/steering.js"
import type { OperationRecord } from "../sql/operations.js"
import {
  completedOperationRefValue,
  hydrateCompletedOperation,
  liveModelResponseEvent,
  type LiveModelResponseCommitted,
} from "./model-response/commit.js"

interface PreparedCompletion {
  readonly continuation?: ExecutionContinuation | null
  readonly steeringEntryIds?: ReadonlyArray<string>
}

/** Commit the driver result through the model-specific atomic outbox or the generic operation path. */
export const commitDriverOperation = (input: {
  readonly store: RunStoreInterface
  readonly claim: ExecutionClaim
  readonly operation: DurableDriver.DriverOperation
  readonly operationId: string
  readonly outcome: DurableDriver.OperationOutcome
  readonly checkpoint: DurableDriver.DriverCheckpoint
  readonly prepared: PreparedCompletion
}): Effect.Effect<OperationRecord, WorkerMutationError> => {
  const { store, claim, operation, operationId, outcome, checkpoint, prepared } = input
  if (operation.kind === "model" && outcome._tag === "Succeeded") {
    const event = liveModelResponseEvent(outcome.value)
    if (Schema.is(RuntimeUnavailable)(event)) return Effect.fail(event)
    return store.commitModelResponse({ ...claim, operationId, outcome, checkpoint, ...prepared, event })
  }
  let completion: Parameters<RunStoreInterface["completeOperation"]>[0]["outcome"]
  if (outcome._tag === "Succeeded") completion = { _tag: "Succeeded", value: outcome.value }
  else if (outcome._tag === "Failed") completion = { _tag: "Failed", error: outcome.error }
  else completion = { _tag: "Unknown" }
  return store.completeOperation({
    ...claim,
    operationId,
    outcome: completion,
    checkpoint,
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
  (operationKey: string, cause: unknown): (phase: string) => DurableDriver.DriverError
  (phase: string, operationKey: string, cause: unknown): DurableDriver.DriverError
} = Function.dual(3, (phase: string, operationKey: string, cause: unknown) =>
  DurableDriver.DriverError.make({ message: `Driver journal ${phase} failed for ${operationKey}`, cause }),
)

export const saveJournalCheckpoint = (input: {
  readonly store: RunStoreInterface
  readonly claim: ExecutionClaim
  readonly checkpoint: DurableDriver.DriverCheckpoint
}): Effect.Effect<void, DurableDriver.DriverError> =>
  input.store
    .saveExecution({ ...input.claim, checkpoint: input.checkpoint })
    .pipe(Effect.mapError((error) => journalFailure("checkpoint", input.claim.runId, error)))

export const hydratePersistedModelOperation = (input: {
  readonly store: RunStoreInterface
  readonly value: unknown
}): Effect.Effect<unknown, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const reference = completedOperationRefValue(input.value)
    if (reference === undefined)
      return yield* RuntimeUnavailable.make({ message: "persisted model result is not a reference" })
    const session = yield* input.store.sessionStore(reference.sessionId)
    if (Option.isNone(session)) {
      return yield* RuntimeUnavailable.make({ message: `Session ${reference.sessionId} is unavailable` })
    }
    return yield* hydrateCompletedOperation({ session: session.value, reference }).pipe(
      Effect.mapError((error) =>
        RuntimeUnavailable.make({
          message:
            error._tag === "tenetkit/runtime/SessionEntryCorrupt"
              ? error.message
              : `Session entry ${error.entryId} is missing from ${error.sessionId}`,
        }),
      ),
    )
  })

/** Verify Core's later live semantic event against the already committed transactional outbox. */
export const verifyCommittedModelEvent = (input: {
  readonly store: RunStoreInterface
  readonly claim: ExecutionClaim
  readonly event: LiveModelResponseCommitted
}): Effect.Effect<
  void,
  | RuntimeUnavailable
  | import("../errors.js").RunNotFound
  | import("../sql/errors.js").StaleClaim
  | import("effect/unstable/sql/SqlError").SqlError
  | import("../errors.js").RunTerminal
> =>
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
    yield* input.store.commitModelResponse({
      ...input.claim,
      operationId: persisted.operationId,
      outcome: { _tag: "Succeeded", value: persisted.result },
      transitionDigest: reference.transitionDigest,
      event: input.event,
    })
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
