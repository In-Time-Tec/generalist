import { Effect, Function, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AgentExecutionFailure } from "tenetkit/runtime/driver/errors"
import type { ExclusiveExecutionRecovery } from "tenetkit/runtime/driver/execution/recovery/exclusive"
import type { RunActivationProjection } from "tenetkit/runtime/driver/run/activation"
import { fail } from "tenetkit/runtime/driver/sql/store/control"
import { requireExecutionClaim } from "tenetkit/runtime/driver/sql/store/execution"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"

interface ClaimedRow {
  readonly run_id: string
  readonly status: "running" | "cancelling"
  readonly owner_worker_id: string
  readonly attempt_fence: number
}

const eventHub: EventHub = {
  touchRun: () => Effect.void,
  publish: () => Effect.void,
  wakeTree: () => Effect.void,
  subscribe: () => Stream.empty,
  subscribeTree: () => Stream.empty,
  shutdown: Effect.void,
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
                  attemptFence: row.attempt_fence,
                })
                yield* fail(eventHub, {
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
            const continuation = selected[selected.length - 1]?.run_id
            if (rows.length > limit && continuation !== undefined) return { recovered: selected.length, continuation }
            return { recovered: selected.length }
          }),
        )
        .pipe(Effect.provideService(SqlClient.SqlClient, sqlClient), Effect.orDie),
  }),
)
