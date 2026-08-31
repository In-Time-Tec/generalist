import { Effect, Function } from "effect"
import type { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { ExecutionClaim } from "../../../run/store.js"
import { expireRunningOperation } from "./expiry.js"
import type { MemoryState } from "../../state.js"

type RecoveryEffect = Effect.Effect<readonly ["ready" | "blocked", MemoryState], RunNotFound | RuntimeUnavailable>

export const recoverRunningOperations: {
  (input: ExecutionClaim): (state: MemoryState) => RecoveryEffect
  (state: MemoryState, input: ExecutionClaim): RecoveryEffect
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) =>
  Effect.gen(function* () {
    const operationIds = [
      ...new Set(
        [...state.operations.values()]
          .filter((operation) => operation.runId === input.runId && operation.status === "running")
          .map((operation) => operation.operationId),
      ),
    ].toSorted()
    let next = state
    for (const operationId of operationIds) {
      const [, recovered] = yield* expireRunningOperation(next, { runId: input.runId, operationId })
      next = recovered
    }
    return [next.runs.get(input.runId)?.status === "needs-resolution" ? "blocked" : "ready", next] as const
  }),
)
