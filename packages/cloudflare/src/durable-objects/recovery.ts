import { Effect, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AgentExecutionFailure } from "tenetkit/runtime/driver/errors"
import type { ExclusiveExecutionRecovery } from "tenetkit/runtime/driver/exclusive-execution-recovery"
import type { RunActivationProjection } from "tenetkit/runtime/driver/run-activation"
import { fail } from "tenetkit/runtime/driver/sql/store-control"
import { requireExecutionClaim } from "tenetkit/runtime/driver/sql/store-execution"

interface ClaimedRow {
  readonly run_id: string
  readonly status: "running" | "cancelling"
  readonly owner_worker_id: string
  readonly attempt_fence: number
}

/** @experimental Construct stale-claim recovery for a proven-exclusive Durable Object incarnation. */
export const makeExclusiveExecutionRecovery: {
  (sqlClient: SqlClient.SqlClient, projection: RunActivationProjection): ExclusiveExecutionRecovery
  (projection: RunActivationProjection): (sqlClient: SqlClient.SqlClient) => ExclusiveExecutionRecovery
} = Function.dual(
  2,
  (sqlClient: SqlClient.SqlClient, projection: RunActivationProjection): ExclusiveExecutionRecovery => ({
    recoverClaims: (input) =>
      sqlClient
        .withTransaction(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient
            const limit = Math.max(1, Math.min(1000, Math.floor(input.limit ?? 100)))
            const rows = yield* sql<ClaimedRow>`
          SELECT run_id, status, owner_worker_id, attempt_fence FROM tenetkit_runs
          WHERE owner_worker_id IS NOT NULL AND owner_worker_id <> ${input.newOwnerId}
            AND status IN ('running', 'cancelling')
            AND run_id > ${input.afterRunId ?? ""}
          ORDER BY run_id LIMIT ${limit + 1}`
            const selected = rows.slice(0, limit)
            for (const row of selected) {
              if (row.status === "cancelling") {
                yield* requireExecutionClaim({
                  runId: row.run_id,
                  ownerId: row.owner_worker_id,
                  attemptFence: Number(row.attempt_fence),
                })
                yield* fail({ publish: () => Effect.void } as never, {
                  runId: row.run_id,
                  error: AgentExecutionFailure.make({ message: "exclusive host incarnation replaced" }),
                })
              }
              yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL, attempt_fence = attempt_fence + 1
            WHERE run_id = ${row.run_id} AND attempt_fence = ${row.attempt_fence}`
            }
            if (selected.length > 0) {
              const final = yield* sql<{ run_id: string; status: string; attempt_fence: number }>`
            SELECT run_id, status, attempt_fence FROM tenetkit_runs
            WHERE run_id IN ${sql.in(selected.map((row) => row.run_id))}`
              const finalState = new Map(final.map((row) => [row.run_id, row] as const))
              yield* projection.applyInTransaction(
                selected.map((row) => {
                  const state = finalState.get(row.run_id)
                  if (state?.status !== "running" && state?.status !== "cancelling") {
                    return { runId: row.run_id, intent: "inactive" as const }
                  }
                  return {
                    runId: row.run_id,
                    intent: state.status === "cancelling" ? ("cancel" as const) : ("execute" as const),
                    attemptFence: state.attempt_fence,
                    runStatus: state.status,
                  }
                }),
              )
            }
            return {
              recovered: selected.length,
              ...(rows.length > limit ? { continuation: selected[selected.length - 1]!.run_id } : {}),
            }
          }),
        )
        .pipe(
          Effect.provideService(SqlClient.SqlClient, sqlClient),
          Effect.mapError((error) => error as never),
        ),
  }),
)
