import type { Event } from "../event.js"
import type { AttemptCompleted, CompletedModelOperation } from "../../model/operation.js"

/** @internal Public semantic event derived from the canonical model operation result. */
export const committedEvent = (input: {
  readonly operation: CompletedModelOperation
  readonly attempt: AttemptCompleted
}): Event => {
  const { operation, attempt } = input
  return {
    _tag: "ModelResponseCommitted",
    turn: operation.turn,
    operationKey: operation.operationId,
    modelCallId: operation.modelCallId,
    modelAttemptId: operation.modelAttemptId,
    attempt: operation.attempt,
    response: attempt.response,
    digest: operation.digest,
  }
}
