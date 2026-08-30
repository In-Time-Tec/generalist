import { DateTime, Duration, Effect, Schema, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { AgentExecutionFailure, RuntimeUnavailable, failureMessage } from "tenetkit/runtime/driver/errors"
import { RunClaims, type ClaimedRun, type Service as ClaimsService } from "tenetkit/runtime/driver/sql/run/claims"
import type { RunRow } from "tenetkit/runtime/driver/sql/codec/rows"
import { appendEvent, loadRun } from "tenetkit/runtime/driver/sql/store/statements"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import { cancel, complete, fail } from "tenetkit/runtime/driver/sql/store/control"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/effect"
import { ExecutionResult } from "tenetkit/runtime/driver/execution/state"
import { acquireSessionWriteClaim, revokeSessionWriteClaim } from "tenetkit/runtime/driver/sql/session/claim"
import { releaseExecution, requireExecutionClaim } from "tenetkit/runtime/driver/sql/store/execution"

export type RunFn = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlClient.SqlClient>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

/** @experimental MySQL reports lock contention as a retryable deadlock rather than a durable failure. */
export const isDeadlock = (error: SqlError): boolean => {
  if (!isSqlError(error)) return false
  const text = `${error.message} ${String(error.reason)}`.toLowerCase()
  return text.includes("deadlock") || text.includes("1213") || text.includes("40001")
}

/** @experimental Pin every pooled connection to READ COMMITTED before the store serves traffic. */
export const initializeReadCommitted = (input: { readonly sql: SqlClient.SqlClient; readonly connections: number }) =>
  Effect.scoped(
    Effect.gen(function* () {
      const reserved = yield* Effect.all(
        Array.from({ length: input.connections }, () => input.sql.reserve),
        { concurrency: "unbounded" },
      )
      yield* Effect.forEach(
        reserved,
        (connection) =>
          connection.executeUnprepared("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED", [], undefined),
        { concurrency: "unbounded", discard: true },
      )
    }),
  )

export const mysqlClaims = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: RunFn
  readonly lockParent: (runId: string) => Effect.Effect<void, SqlError>
  readonly clearClaim: (runId: string) => Effect.Effect<void, SqlError>
}): ClaimsService => {
  const { sql, hub, run, lockParent, clearClaim } = input
  return RunClaims.of({
    changes: Stream.concat(Stream.succeed(undefined), Stream.never),
    claimReadyRuns: (claimInput) =>
      run(
        Effect.gen(function* () {
          const leaseMicros = Duration.toMillis(claimInput.lease ?? "30 seconds") * 1_000
          const scanLimit = Math.max(claimInput.limit, Math.min(4096, claimInput.limit * 64))
          const candidates = yield* sql<{ run_id: string }>`
            SELECT ranked.run_id
            FROM (
              SELECT
                r.run_id,
                r.accepted_sequence,
                ROW_NUMBER() OVER (PARTITION BY r.session_id ORDER BY r.accepted_sequence ASC) AS session_rank
              FROM tenetkit_runs r
              WHERE (
                  (r.cancellation_requested = 1 AND r.status = 'cancelling')
                  OR (
                    r.cancellation_requested = 0
                    AND (
                      (
                        r.parent_run_id IS NULL
                        AND (
                          r.status = 'running'
                          OR EXISTS (
                            SELECT 1 FROM tenetkit_lanes l
                            WHERE JSON_UNQUOTE(JSON_EXTRACT(l.queue_json, '$[0]')) = r.run_id
                          )
                        )
                      )
                      OR EXISTS (
                        SELECT 1 FROM tenetkit_run_links link
                        WHERE link.child_run_id = r.run_id AND link.readiness = 'ready'
                      )
                    )
                  )
                )
                AND r.status IN ('queued', 'running', 'cancelling')
                AND (r.owner_worker_id IS NULL OR r.lease_expires_at IS NULL OR r.lease_expires_at < NOW(3))
                AND NOT EXISTS (
                  SELECT 1 FROM tenetkit_sessions s
                  WHERE s.session_id = r.session_id
                    AND s.writer_run_id IS NOT NULL
                    AND s.writer_run_id <> r.run_id
                )
            ) ranked
            WHERE ranked.session_rank = 1
            ORDER BY ranked.accepted_sequence ASC
            LIMIT ${sql.literal(String(Math.max(0, Math.floor(scanLimit))))}
          `
          const claimed: Array<ClaimedRun> = []
          for (const candidate of candidates) {
            if (claimed.length >= claimInput.limit) break
            const locked = yield* sql<RunRow>`
              SELECT * FROM tenetkit_runs
              WHERE run_id = ${candidate.run_id}
                AND status IN ('queued', 'running', 'cancelling')
                AND (owner_worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW(3))
              FOR UPDATE SKIP LOCKED
            `
            const row = locked[0]
            if (row === undefined) continue
            const wasQueued = row.status === "queued"
            yield* sql`
              UPDATE tenetkit_runs SET
                owner_worker_id = ${claimInput.workerId},
                lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND),
                attempt_fence = attempt_fence + 1,
                attempt = IF(status = 'queued', attempt + 1, attempt),
                status = IF(status = 'queued', 'running', status),
                updated_at = NOW(3)
              WHERE run_id = ${row.run_id}
            `
            let fresh = (yield* loadRun(row.run_id))!
            const session = yield* acquireSessionWriteClaim({
              sessionId: fresh.sessionId,
              runId: fresh.runId,
              ownerId: claimInput.workerId,
              runAttemptFence: fresh.attemptFence,
            })
            if (wasQueued) {
              yield* appendEvent(hub, fresh, { _tag: "RunAttemptStarted", attempt: fresh.attempt }, "running")
              fresh = (yield* loadRun(row.run_id))!
            }
            claimed.push({
              run: fresh,
              workerId: claimInput.workerId,
              attemptFence: fresh.attemptFence,
              session,
              leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(fresh.leaseExpiresAt!)),
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
            SELECT run_id FROM tenetkit_runs
            WHERE run_id = ${leaseInput.runId} AND owner_worker_id = ${leaseInput.workerId}
              AND attempt_fence = ${leaseInput.attemptFence}
              AND cancellation_requested = ${leaseInput.cancellationRequested ? 1 : 0}
              AND status NOT IN ('succeeded', 'failed', 'cancelled')
            FOR UPDATE
          `
          if (rows.length === 0) return false
          const currentSession = yield* requireExecutionClaim({
            runId: leaseInput.runId,
            ownerId: leaseInput.workerId,
            attemptFence: leaseInput.attemptFence,
            session: leaseInput.session,
          }).pipe(
            Effect.as(true),
            Effect.catchTag(
              ["tenetkit/runtime/RunNotFound", "tenetkit/runtime/StaleClaim", "tenetkit/runtime/StaleSessionClaim"],
              () => Effect.succeed(false),
            ),
          )
          if (!currentSession) return false
          yield* sql`
            UPDATE tenetkit_runs
            SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND), updated_at = NOW(3)
            WHERE run_id = ${leaseInput.runId}
          `
          return true
        }),
      ),
    releaseClaim: (releaseInput) =>
      run(
        releaseExecution({
          runId: releaseInput.runId,
          ownerId: releaseInput.workerId,
          attemptFence: releaseInput.attemptFence,
          session: releaseInput.session,
        }),
      ),
    commitWithClaim: (commitInput) =>
      run(
        Effect.gen(function* () {
          const rows = yield* sql<RunRow>`
            SELECT * FROM tenetkit_runs
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
          yield* requireExecutionClaim({
            runId: commitInput.runId,
            ownerId: commitInput.workerId,
            attemptFence: commitInput.attemptFence,
            session: commitInput.session,
          })
          if (commitInput.transition === "cancel") {
            const cancellation = {
              runId: commitInput.runId,
              ...(commitInput.reason === undefined ? undefined : { reason: commitInput.reason }),
            }
            yield* cancel(hub, cancellation)
            if (!(yield* revokeSessionWriteClaim(commitInput.session))) {
              return yield* RuntimeUnavailable.make({
                message: `Run ${commitInput.runId} Session write binding was not revoked`,
              })
            }
          } else if (commitInput.transition === "complete") {
            const result = yield* Schema.decodeUnknownEffect(ExecutionResult)(commitInput.result).pipe(
              Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
            )
            yield* complete(hub, {
              runId: commitInput.runId,
              ownerId: commitInput.workerId,
              attemptFence: commitInput.attemptFence,
              session: commitInput.session,
              result,
            })
          } else {
            yield* fail(hub, {
              runId: commitInput.runId,
              ownerId: commitInput.workerId,
              attemptFence: commitInput.attemptFence,
              session: commitInput.session,
              error: AgentExecutionFailure.make({ message: failureMessage(commitInput.error?.message ?? "failed") }),
            })
          }
          yield* clearClaim(commitInput.runId)
        }),
      ),
  })
}
