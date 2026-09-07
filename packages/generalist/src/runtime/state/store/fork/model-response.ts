import { Effect, Schema } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import {
  completedOperationRefValue,
  retargetCompletedOperationRef,
  validateCompletedOperationSource,
} from "../../../execution/model-response/commit.js"
import type { RunEvent } from "../../../run/event.js"
import type { OperationRecord } from "../../../operation/record.js"
import type { RuntimeSession } from "../../projection.js"

export const copyModelResponse = (input: {
  readonly operation: OperationRecord
  readonly sourceSession?: RuntimeSession
  readonly sourceSessionId: string
  readonly sourceEvents: ReadonlyArray<RunEvent>
  readonly targetSessionId: string
  readonly targetOperationKey: string
}) =>
  Effect.gen(function* () {
    const persisted = completedOperationRefValue(input.operation.result)
    if (persisted === undefined)
      return yield* RuntimeUnavailable.make({ message: "copied model operation has an invalid completed reference" })
    const sourceEntry = input.sourceSession?.entries.get(persisted.sessionEntryId)
    const sourceEvent = input.sourceEvents.find(
      (event) => event._tag === "ModelResponseCommitted" && event.operationKey === input.operation.operationKey,
    )
    const content = validateCompletedOperationSource({
      value: persisted,
      sessionId: input.sourceSessionId,
      operationKey: input.operation.operationKey,
      entry: sourceEntry,
      event: sourceEvent?._tag === "ModelResponseCommitted" ? sourceEvent : undefined,
    })
    if ("_tag" in content) return yield* content
    const reference = retargetCompletedOperationRef({
      value: persisted,
      sessionId: input.targetSessionId,
      operationId: input.targetOperationKey,
      content,
    })
    if (Schema.is(RuntimeUnavailable)(reference)) return yield* reference
    return {
      reference,
      entry: { ...sourceEntry!, metadata: { ...sourceEntry!.metadata, modelResponseDigest: reference.digest } },
    }
  })
