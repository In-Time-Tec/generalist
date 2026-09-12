import type { PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import {
  canBlindRetry,
  type OperationRecord,
  type OperationStatus,
  type RetryReason,
} from "../../../operation/record.js"
import { appendLifecycle } from "../../append.js"
import { operationKeyMapKey, operationMapKey, type RuntimeState } from "../../projection.js"

const getRun = (state: RuntimeState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

type ExpireRunningOperationInput = {
  readonly runId: string
  readonly operationId: string
  readonly reason?: RetryReason
}

export const expireRunningOperation: {
  (
    input: ExpireRunningOperationInput,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<
    readonly [
      { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
      RuntimeState,
    ],
    RunNotFound | RuntimeUnavailable,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: ExpireRunningOperationInput,
  ): Effect.Effect<
    readonly [
      { readonly record: OperationRecord; readonly outcome: "retried" | "unknown" | OperationStatus },
      RuntimeState,
    ],
    RunNotFound | RuntimeUnavailable,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: ExpireRunningOperationInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    if (current.status !== "running") return [{ record: current, outcome: current.status }, state] as const
    const operations = new Map(state.operations)
    if (canBlindRetry(current.replayPolicy) || input.reason === "child-admission-rejected") {
      const record: OperationRecord = { ...current, status: "requested" }
      operations.set(operationMapKey(input.runId, input.operationId), record)
      operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
      return [
        { record, outcome: "retried" as const },
        { ...state, operations },
      ] as const
    }
    const record: OperationRecord = { ...current, status: "unknown" }
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    if (isTerminal(run.status))
      return [
        { record, outcome: "unknown" as const },
        { ...state, operations },
      ] as const
    const [, next] = yield* appendLifecycle(
      { ...state, operations },
      run.runId,
      { _tag: "OperationUnknown", operationId: input.operationId },
      "needs-resolution",
    )
    return [{ record, outcome: "unknown" as const }, next] as const
  }),
)
