import { Duration, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RuntimeUnavailable } from "../../errors.js"
import { RunClaims, type ClaimedRun, type Interface as ClaimsInterface } from "../run-claims.js"
import type { RunRow } from "../rows.js"
import { appendEvent, loadRun } from "../store-helpers.js"
import type { EventHub } from "../subscribers.js"
import { StaleClaim } from "../errors.js"
import { cancel, complete, fail } from "../store-control.js"

type RunFn = <A, E>(
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
) => Effect.Effect<A, Exclude<E, { readonly _tag: "SqlError" }> | RuntimeUnavailable>

export const makeMysqlClaims = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly lockParent: (runId: string) => Effect.Effect<void, SqlError>
  readonly clearClaim: (runId: string) => Effect.Effect<void, SqlError>
}): ClaimsInterface => {
  const { sql, hub, run, lockParent, clearClaim } = input
  return RunClaims.of({
    claimReadyRuns: (claimInput) =>
      run(
        Effect.gen(function* () {
          const leaseMicros = Duration.toMillis(claimInput.lease ?? "30 seconds") * 1_000
          const scanLimit = Math.max(claimInput.limit, Math.min(4096, claimInput.limit * 64))
          const candidates = yield* sql<{ run_id: string }>`
            SELECT r.run_id FROM baton_runs r
            WHERE (
                r.parent_run_id IS NOT NULL
                OR EXISTS (
                  SELECT 1 FROM baton_lanes l
                  WHERE JSON_UNQUOTE(JSON_EXTRACT(l.queue_json, '$[0]')) = r.run_id
                )
              )
              AND (
                NOT EXISTS (SELECT 1 FROM baton_fan_out_members fm WHERE fm.child_run_id = r.run_id)
                OR EXISTS (SELECT 1 FROM baton_fan_out_members fm WHERE fm.child_run_id = r.run_id AND fm.status = 'running')
              )
              AND r.status IN ('queued', 'running', 'needs-resolution', 'cancelling')
              AND r.cancellation_requested = 0
              AND (r.owner_worker_id IS NULL OR r.lease_expires_at IS NULL OR r.lease_expires_at < NOW(3))
            ORDER BY r.accepted_sequence ASC
            LIMIT ${sql.literal(String(Math.max(0, Math.floor(scanLimit))))}
          `
          const claimed: Array<ClaimedRun> = []
          for (const candidate of candidates) {
            if (claimed.length >= claimInput.limit) break
            const locked = yield* sql<RunRow>`
              SELECT * FROM baton_runs
              WHERE run_id = ${candidate.run_id}
                AND status IN ('queued', 'running', 'needs-resolution', 'cancelling')
                AND cancellation_requested = 0
                AND (owner_worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW(3))
              FOR UPDATE SKIP LOCKED
            `
            const row = locked[0]
            if (row === undefined) continue
            const wasQueued = row.status === "queued"
            yield* sql`
              UPDATE baton_runs SET
                owner_worker_id = ${claimInput.workerId},
                lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND),
                attempt_fence = attempt_fence + 1,
                attempt = IF(status = 'queued', attempt + 1, attempt),
                status = IF(status = 'queued', 'running', status),
                updated_at = NOW(3)
              WHERE run_id = ${row.run_id}
            `
            let fresh = (yield* loadRun(row.run_id))!
            if (wasQueued) {
              yield* appendEvent(hub, fresh, { _tag: "RunAttemptStarted", attempt: fresh.attempt }, "running")
              fresh = (yield* loadRun(row.run_id))!
            }
            claimed.push({
              run: fresh,
              workerId: claimInput.workerId,
              attemptFence: fresh.attemptFence,
              leaseExpiresAt: new Date(fresh.leaseExpiresAt!),
            })
          }
          return claimed
        }),
      ),
    refreshLease: (leaseInput) =>
      run(
        Effect.gen(function* () {
          const leaseMicros = Duration.toMillis(leaseInput.lease ?? "30 seconds") * 1_000
          const rows = yield* sql<{ run_id: string }>`
            SELECT run_id FROM baton_runs
            WHERE run_id = ${leaseInput.runId} AND owner_worker_id = ${leaseInput.workerId}
              AND attempt_fence = ${leaseInput.attemptFence}
              AND cancellation_requested = 0
              AND status NOT IN ('succeeded', 'failed', 'cancelled')
            FOR UPDATE
          `
          if (rows.length === 0) return false
          yield* sql`
            UPDATE baton_runs
            SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND), updated_at = NOW(3)
            WHERE run_id = ${leaseInput.runId}
          `
          return true
        }),
      ),
    releaseClaim: (releaseInput) =>
      run(
        sql`
        UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL, updated_at = NOW(3)
        WHERE run_id = ${releaseInput.runId} AND owner_worker_id = ${releaseInput.workerId}
          AND attempt_fence = ${releaseInput.attemptFence}
      `.pipe(Effect.asVoid),
      ),
    commitWithClaim: (commitInput) =>
      run(
        Effect.gen(function* () {
          const rows = yield* sql<RunRow>`
            SELECT * FROM baton_runs
            WHERE run_id = ${commitInput.runId} AND owner_worker_id = ${commitInput.workerId}
              AND attempt_fence = ${commitInput.attemptFence}
            FOR UPDATE
          `
          if (rows[0] === undefined)
            return yield* StaleClaim.make({
              runId: commitInput.runId,
              workerId: commitInput.workerId,
              attemptFence: commitInput.attemptFence,
            })
          yield* lockParent(commitInput.runId)
          if (commitInput.transition === "cancel") {
            yield* cancel(hub, {
              runId: commitInput.runId,
              ...(commitInput.reason === undefined ? {} : { reason: commitInput.reason }),
            })
          } else if (commitInput.transition === "complete") {
            yield* complete(hub, { runId: commitInput.runId, result: commitInput.result as never })
          } else {
            yield* fail(hub, { runId: commitInput.runId, error: commitInput.error ?? { message: "failed" } })
          }
          yield* clearClaim(commitInput.runId)
        }),
      ),
  })
}
