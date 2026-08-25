import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, type RuntimeUnavailable } from "../errors.js"
import type { ExecutionClaim } from "../run-store.js"
import { expireRunningOperation } from "./store-operations.js"
import { loadRun } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"

type RecoveryEffect = Effect.Effect<
  "ready" | "blocked",
  RunNotFound | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

export const recoverRunningOperations: {
  (input: ExecutionClaim): (hub: EventHub) => RecoveryEffect
  (hub: EventHub, input: ExecutionClaim): RecoveryEffect
} = Function.dual(2, (hub: EventHub, input: ExecutionClaim) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const operations = yield* sql<{ readonly operation_id: string }>`
      SELECT operation_id FROM tenetkit_run_operations
      WHERE run_id = ${input.runId} AND status = 'running'
      ORDER BY operation_id
    `
    for (const operation of operations) {
      yield* expireRunningOperation(hub, { runId: input.runId, operationId: operation.operation_id })
    }
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
    return run.status === "needs-resolution" ? "blocked" : "ready"
  }),
)
