import { Effect, Function } from "effect"
import { OperationResolutionConflict, RunNotFound, RuntimeUnavailable } from "../errors.js"
import { digest as resolutionDigest, type ResolveOperationInput } from "../operation-resolution.js"
import type { OperationRecord } from "../sql/operations.js"
import { operationKeyMapKey, operationMapKey, type MemoryState } from "./state.js"

const getRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const resolveOperation: {
  (
    input: ResolveOperationInput,
  ): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
  (
    state: MemoryState,
    input: ResolveOperationInput,
  ): Effect.Effect<MemoryState, RunNotFound | OperationResolutionConflict | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: ResolveOperationInput) =>
  Effect.gen(function* () {
    const run = yield* getRun(state, input.runId)
    const current = state.operations.get(operationMapKey(input.runId, input.operationId))
    const conflict = () =>
      OperationResolutionConflict.make({
        runId: input.runId,
        operationId: input.operationId,
        idempotencyKey: input.idempotencyKey,
      })
    if (current === undefined) return yield* conflict()
    if (current.resolutionIdempotencyKey !== undefined) {
      if (
        current.resolutionIdempotencyKey === input.idempotencyKey &&
        current.resolution !== undefined &&
        resolutionDigest(current.resolution) === resolutionDigest(input.resolution)
      ) {
        return state
      }
      return yield* conflict()
    }
    if (run.status !== "needs-resolution" || current.status !== "unknown") return yield* conflict()
    const resolved = { resolutionIdempotencyKey: input.idempotencyKey, resolution: input.resolution }
    const record: OperationRecord =
      input.resolution._tag === "Succeeded"
        ? { ...current, ...resolved, status: "succeeded", result: input.resolution.value }
        : input.resolution._tag === "Failed"
          ? { ...current, ...resolved, status: "failed", error: input.resolution.error }
          : { ...current, ...resolved, status: "requested" }
    const operations = new Map(state.operations)
    operations.set(operationMapKey(input.runId, input.operationId), record)
    operations.set(operationKeyMapKey(input.runId, record.operationKey), record)
    const runs = new Map(state.runs)
    const { ownerId: _, ...withoutOwner } = run
    runs.set(run.runId, { ...withoutOwner, status: run.cancellationRequested ? "cancelling" : "running" })
    return { ...state, operations, runs }
  }),
)
