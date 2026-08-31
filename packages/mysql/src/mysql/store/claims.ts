import { DateTime, Duration, Effect, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  acquireSessionWriteClaim,
  decodeRunEffect,
  type ClaimedRun,
  type RunRow,
  type SqlClaimMechanics,
} from "generalist/runtime/sql-driver"

/** Pin every pooled connection to READ COMMITTED before the store serves traffic. */
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

/** MySQL's bounded scan, row claim, database-time lease, and polling wakeup mechanics. */
export const mysqlClaimMechanics: SqlClaimMechanics = {
  changes: Stream.concat(Stream.succeed(undefined), Stream.never),
  claimReadyRuns: (input) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const leaseMicros = Duration.toMillis(input.lease ?? "30 seconds") * 1_000
      const scanLimit = Math.max(input.limit, Math.min(4096, input.limit * 64))
      const candidates = yield* sql<{ run_id: string }>`
        SELECT ranked.run_id
        FROM (
          SELECT
            r.run_id,
            r.accepted_sequence,
            ROW_NUMBER() OVER (PARTITION BY r.session_id ORDER BY r.accepted_sequence ASC) AS session_rank
          FROM generalist_runs r
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
                        SELECT 1 FROM generalist_lanes l
                        WHERE JSON_UNQUOTE(JSON_EXTRACT(l.queue_json, '$[0]')) = r.run_id
                      )
                    )
                  )
                  OR EXISTS (
                    SELECT 1 FROM generalist_run_links link
                    WHERE link.child_run_id = r.run_id AND link.readiness = 'ready'
                  )
                )
              )
            )
            AND r.status IN ('queued', 'running', 'cancelling')
            AND (r.owner_worker_id IS NULL OR r.lease_expires_at IS NULL OR r.lease_expires_at < NOW(3))
            AND NOT EXISTS (
              SELECT 1 FROM generalist_sessions s
              WHERE s.session_id = r.session_id
                AND s.writer_run_id IS NOT NULL
                AND s.writer_run_id <> r.run_id
            )
        ) ranked
        WHERE ranked.session_rank = 1
        ORDER BY ranked.accepted_sequence ASC
        LIMIT ${sql.literal(String(Math.max(0, Math.floor(scanLimit))))}
      `
      const claimed: Array<ClaimedRun & { readonly startedAttempt: boolean }> = []
      for (const candidate of candidates) {
        if (claimed.length >= input.limit) break
        const locked = yield* sql<RunRow>`
          SELECT * FROM generalist_runs
          WHERE run_id = ${candidate.run_id}
            AND status IN ('queued', 'running', 'cancelling')
            AND (owner_worker_id IS NULL OR lease_expires_at IS NULL OR lease_expires_at < NOW(3))
          FOR UPDATE SKIP LOCKED
        `
        const row = locked[0]
        if (row === undefined) continue
        yield* sql`
          UPDATE generalist_runs SET
            owner_worker_id = ${input.workerId},
            lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND),
            attempt_fence = attempt_fence + 1,
            attempt = IF(status = 'queued', attempt + 1, attempt),
            status = IF(status = 'queued', 'running', status),
            updated_at = NOW(3)
          WHERE run_id = ${row.run_id}
        `
        const run = yield* decodeRunEffect(
          (yield* sql<RunRow>`SELECT * FROM generalist_runs WHERE run_id = ${row.run_id}`)[0]!,
        )
        const session = yield* acquireSessionWriteClaim({
          sessionId: run.sessionId,
          runId: run.runId,
          ownerId: input.workerId,
          runAttemptFence: run.attemptFence,
        })
        claimed.push({
          run,
          startedAttempt: row.status === "queued",
          workerId: input.workerId,
          attemptFence: run.attemptFence,
          session,
          leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(run.leaseExpiresAt!)),
        })
      }
      return claimed
    }),
  refreshLease: (input) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const rows = yield* sql<{ run_id: string }>`
        SELECT run_id FROM generalist_runs
        WHERE run_id = ${input.runId} AND owner_worker_id = ${input.workerId}
          AND attempt_fence = ${input.attemptFence}
          AND cancellation_requested = ${input.cancellationRequested ? 1 : 0}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
        FOR UPDATE
      `
      if (rows.length === 0) return false
      const leaseMicros = Duration.toMillis(input.lease ?? "30 seconds") * 1_000
      yield* sql`
        UPDATE generalist_runs
        SET lease_expires_at = DATE_ADD(NOW(3), INTERVAL ${sql.literal(String(leaseMicros))} MICROSECOND),
          updated_at = NOW(3)
        WHERE run_id = ${input.runId}
      `
      return true
    }),
}
