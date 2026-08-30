import { Effect, Function, Metric, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { AgentExecutionFailure } from "../../errors.js"
import type { ExclusiveExecutionRecovery } from "../../execution/recovery/exclusive.js"
import type { RunActivationProjection } from "../../run/activation.js"
import type { ExecutionClaim, SessionWriteClaim } from "../../run/store.js"
import { revokeSessionWriteClaim } from "../session/claim.js"
import { fail } from "../store/control.js"
import { requireExecutionClaim } from "../store/execution.js"
import type { EventHub } from "../subscribers.js"

interface ClaimedRow {
  readonly run_id: string
  readonly status: "running" | "cancelling"
  readonly owner_worker_id: string
  readonly attempt_fence: number
  readonly session_id: string
  readonly writer_epoch: string | number | bigint | null
  readonly writer_run_id: string | null
  readonly writer_owner_id: string | null
  readonly writer_attempt_fence: number | null
}

const eventHub: EventHub = {
  touchRun: () => Effect.void,
  publish: () => Effect.void,
  catchUp: (input) => Effect.succeed(input.cursor),
  wakeTree: () => Effect.void,
  subscribe: () => Stream.empty,
  subscribeTree: () => Stream.empty,
  shutdown: Effect.void,
}

const recoveryDuration = Metric.timer("tenetkit_runtime_sql_do_incarnation_recovery_duration", {
  description: "Cloudflare Durable Object exclusive-incarnation recovery duration",
  attributes: { backend: "cloudflare-do" },
})

const recoveredClaims = Metric.counter("tenetkit_runtime_sql_do_incarnation_recovered_claims", {
  description: "Cloudflare Durable Object claims recovered after incarnation replacement",
  attributes: { backend: "cloudflare-do" },
  incremental: true,
})

const claimFromRow = (row: ClaimedRow): ExecutionClaim | undefined => {
  if (
    row.writer_epoch === null ||
    row.writer_run_id !== row.run_id ||
    row.writer_owner_id !== row.owner_worker_id ||
    row.writer_attempt_fence !== row.attempt_fence
  ) {
    return undefined
  }
  const session: SessionWriteClaim = {
    sessionId: row.session_id,
    runId: row.run_id,
    ownerId: row.owner_worker_id,
    runAttemptFence: row.attempt_fence,
    epoch: String(row.writer_epoch),
  }
  return {
    runId: row.run_id,
    ownerId: row.owner_worker_id,
    attemptFence: row.attempt_fence,
    session,
  }
}

/** @experimental Recover stale claims after a host proves exclusive ownership of the database. */
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
              SELECT r.run_id, r.status, r.owner_worker_id, r.attempt_fence, r.session_id,
                s.writer_epoch, s.writer_run_id, s.writer_owner_id, s.writer_attempt_fence
              FROM tenetkit_runs r
              LEFT JOIN tenetkit_sessions s ON s.session_id = r.session_id
              WHERE r.owner_worker_id IS NOT NULL AND r.owner_worker_id <> ${input.newOwnerId}
                AND r.status IN ('running', 'cancelling')
                AND r.run_id > ${input.afterRunId ?? ""}
              ORDER BY r.run_id LIMIT ${limit + 1}
            `
            const selected = rows.slice(0, limit)
            for (const row of selected) {
              const claim = claimFromRow(row)
              if (claim === undefined) {
                return yield* AgentExecutionFailure.make({
                  message: `Run ${row.run_id} has no exact Session write binding`,
                })
              }
              yield* requireExecutionClaim(claim)
              if (row.status === "cancelling") {
                yield* fail(eventHub, {
                  ...claim,
                  error: AgentExecutionFailure.make({ message: "exclusive host incarnation replaced" }),
                })
                continue
              }
              const released = yield* sql<{ readonly run_id: string }>`
                UPDATE tenetkit_runs SET owner_worker_id = NULL, attempt_fence = attempt_fence + 1
                WHERE run_id = ${row.run_id}
                  AND owner_worker_id = ${row.owner_worker_id}
                  AND attempt_fence = ${row.attempt_fence}
                RETURNING run_id
              `
              if (released.length !== 1 || !(yield* revokeSessionWriteClaim(claim.session))) {
                return yield* AgentExecutionFailure.make({
                  message: `Run ${row.run_id} exclusive recovery lost its exact binding`,
                })
              }
            }
            if (selected.length > 0) {
              const final = yield* sql<{ run_id: string; status: string; attempt_fence: number }>`
                SELECT run_id, status, attempt_fence FROM tenetkit_runs
                WHERE run_id IN ${sql.in(selected.map((row) => row.run_id))}
              `
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
            const continuation = selected.at(-1)?.run_id
            if (rows.length > limit && continuation !== undefined) {
              return { recovered: selected.length, continuation }
            }
            return { recovered: selected.length }
          }),
        )
        .pipe(
          Effect.provideService(SqlClient.SqlClient, sqlClient),
          Effect.orDie,
          Effect.tap((result) =>
            Metric.update(recoveredClaims, result.recovered).pipe(
              Effect.andThen(
                Effect.annotateCurrentSpan({
                  "tenetkit.runtime.sql.backend": "cloudflare-do",
                  "tenetkit.runtime.sql.recovered_claims": result.recovered,
                  "tenetkit.runtime.sql.recovery_has_more": result.continuation !== undefined,
                }),
              ),
            ),
          ),
          Effect.trackDuration(recoveryDuration),
          Effect.withSpan("TenetKit.Runtime.sqlExclusiveRecovery"),
        ),
  }),
)
