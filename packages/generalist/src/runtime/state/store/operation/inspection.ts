import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { OperationRecord } from "../../../operation/record.js"
import { operationKeyMapKey, operationMapKey, type RuntimeState } from "../../state.js"

const getRun = (state: RuntimeState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const getOperation: {
  (input: {
    readonly runId: string
    readonly operationId: string
  }): (state: RuntimeState) => Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
  (
    state: RuntimeState,
    input: { readonly runId: string; readonly operationId: string },
  ): Effect.Effect<OperationRecord, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: RuntimeState, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    if (current === undefined) return yield* RuntimeUnavailable.make({ message: "operation missing" })
    return current
  }),
)

export const getOperationByKey: {
  (input: {
    readonly runId: string
    readonly operationKey: string
  }): (state: RuntimeState) => Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable, never>
  (
    state: RuntimeState,
    input: { readonly runId: string; readonly operationKey: string },
  ): Effect.Effect<OperationRecord | undefined, RunNotFound | RuntimeUnavailable, never>
} = Function.dual(2, (state: RuntimeState, input: { readonly runId: string; readonly operationKey: string }) =>
  Effect.gen(function* () {
    yield* getRun(state, input.runId)
    return state.operations.get(operationKeyMapKey(input.runId, input.operationKey))
  }),
)
