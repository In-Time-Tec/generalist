import { DurableDriver } from "@batonfx/core"
import { Effect, Ref, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { RuntimeUnavailable } from "./errors.js"
import type { ModelResponseCommitted } from "./agent-event.js"
import type { ExecutionClaim, Interface as RunStoreInterface } from "./run-store.js"
import type { ExecutionContinuation } from "./steering.js"
import { modelResponseEvent } from "./model-response-commit.js"

interface PreparedCompletion {
  readonly transcript?: Prompt.Prompt
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
  readonly handoffTranscript?: Prompt.Prompt
}) => {
  const { store, claim, operation, operationId, outcome, checkpoint, prepared } = input
  if (operation.kind === "model" && outcome._tag === "Succeeded") {
    const event = modelResponseEvent(outcome.value)
    if (Schema.is(RuntimeUnavailable)(event)) return event
    return store.commitModelResponse({ ...claim, operationId, outcome, checkpoint, ...prepared, event })
  }
  return store.completeOperation({
    ...claim,
    operationId,
    outcome:
      outcome._tag === "Succeeded"
        ? { _tag: "Succeeded", value: outcome.value }
        : outcome._tag === "Failed"
          ? { _tag: "Failed", error: outcome.error }
          : { _tag: "Unknown" },
    checkpoint,
    ...prepared,
    ...(input.handoffTranscript === undefined ? {} : { transcript: input.handoffTranscript }),
  })
}

/** Verify Core's later live semantic event against the already committed transactional outbox. */
export const verifyCommittedModelEvent = (input: {
  readonly store: RunStoreInterface
  readonly claim: ExecutionClaim
  readonly event: ModelResponseCommitted
}): Effect.Effect<
  void,
  | RuntimeUnavailable
  | import("./errors.js").RunNotFound
  | import("./sql/errors.js").StaleClaim
  | import("effect/unstable/sql/SqlError").SqlError
  | import("./errors.js").RunTerminal
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
    yield* input.store.commitModelResponse({
      ...input.claim,
      operationId: persisted.operationId,
      outcome: { _tag: "Succeeded", value: persisted.result },
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
