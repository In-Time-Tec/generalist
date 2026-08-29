import { Clock, DateTime, Duration, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import type { ClaimedRun } from "tenetkit/runtime/driver/sql/run/claims"
import { decodeRunEffect, loadRun } from "tenetkit/runtime/driver/sql/store/statements"
import type { RunRow } from "tenetkit/runtime/driver/sql/codec/rows"
import { acquireSessionWriteClaim } from "tenetkit/runtime/driver/sql/session/claim"

export interface ClaimOptions {
  readonly workerId: string
  readonly limit: number
  readonly lease: Duration.Input
}

export const claimReadyRuns = (options: ClaimOptions) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const leaseMs = Duration.toMillis(options.lease)
    const claimed = yield* sql<RunRow>`
      WITH eligible AS (
        SELECT
          r.run_id,
          r.session_id,
          r.accepted_sequence,
          ROW_NUMBER() OVER (PARTITION BY r.session_id ORDER BY r.accepted_sequence ASC) AS session_rank
        FROM tenetkit_runs r
        WHERE r.status IN ('queued', 'running', 'cancelling')
          AND (
            (r.cancellation_requested = TRUE AND r.status = 'cancelling')
            OR (
              r.cancellation_requested = FALSE
              AND (
                (
                  r.parent_run_id IS NULL
                  AND (
                    r.status = 'running'
                    OR EXISTS (SELECT 1 FROM tenetkit_lanes l WHERE l.head_run_id = r.run_id)
                  )
                )
                OR EXISTS (
                  SELECT 1 FROM tenetkit_run_links link
                  WHERE link.child_run_id = r.run_id AND link.readiness = 'ready'
                )
              )
            )
          )
          AND (
            r.owner_worker_id IS NULL
            OR r.lease_expires_at IS NULL
            OR r.lease_expires_at < NOW()
          )
          AND NOT EXISTS (
            SELECT 1 FROM tenetkit_sessions s
            WHERE s.session_id = r.session_id
              AND s.writer_run_id IS NOT NULL
              AND s.writer_run_id <> r.run_id
          )
      ), candidates AS (
        SELECT r.run_id
        FROM tenetkit_runs r
        INNER JOIN eligible e ON e.run_id = r.run_id
        WHERE e.session_rank = 1
        ORDER BY e.accepted_sequence ASC
        FOR UPDATE OF r SKIP LOCKED
        LIMIT ${options.limit}
      )
      UPDATE tenetkit_runs AS r
      SET
        owner_worker_id = ${options.workerId},
        lease_expires_at = NOW() + (${leaseMs}::double precision * INTERVAL '1 millisecond'),
        attempt_fence = r.attempt_fence + 1,
        attempt = CASE
          WHEN r.status = 'queued' THEN r.attempt + 1
          ELSE r.attempt
        END,
        status = CASE
          WHEN r.status = 'queued' THEN 'running'
          ELSE r.status
        END,
        updated_at = NOW()
      FROM candidates c
      WHERE r.run_id = c.run_id
      RETURNING r.*
    `
    const out: Array<ClaimedRun> = []
    for (const row of claimed) {
      const run = yield* decodeRunEffect(row)
      const session = yield* acquireSessionWriteClaim({
        sessionId: run.sessionId,
        runId: run.runId,
        ownerId: options.workerId,
        runAttemptFence: run.attemptFence,
      })
      out.push({
        run,
        workerId: options.workerId,
        attemptFence: run.attemptFence,
        session,
        leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(run.leaseExpiresAt ?? (yield* Clock.currentTimeMillis))),
      })
    }
    return out
  })

export const refreshLease = (input: {
  readonly runId: string
  readonly workerId: string
  readonly attemptFence: number
  readonly cancellationRequested: boolean
  readonly lease: Duration.Input
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const leaseMs = Duration.toMillis(input.lease)
    const rows = yield* sql<{ run_id: string }>`
      UPDATE tenetkit_runs
      SET
        lease_expires_at = NOW() + (${leaseMs}::double precision * INTERVAL '1 millisecond'),
        updated_at = NOW()
      WHERE run_id = ${input.runId}
        AND owner_worker_id = ${input.workerId}
        AND attempt_fence = ${input.attemptFence}
        AND cancellation_requested = ${input.cancellationRequested}
        AND status NOT IN ('succeeded', 'failed', 'cancelled')
      RETURNING run_id
    `
    return rows.length > 0
  })

export const requireClaim = (input: {
  readonly runId: string
  readonly workerId: string
  readonly attemptFence: number
}) =>
  Effect.gen(function* () {
    const run = yield* loadRun(input.runId)
    if (run === undefined) return yield* StaleClaim.make(input)
    if (run.ownerWorkerId !== input.workerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make(input)
    }
    return run
  })
