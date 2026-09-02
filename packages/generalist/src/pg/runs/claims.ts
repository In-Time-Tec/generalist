import { Clock, DateTime, Duration, Effect, Random, Schedule, Stream } from "effect"
import { PgClient } from "@effect/sql-pg"
import { Reactivity } from "effect/unstable/reactivity"
import { SqlClient } from "effect/unstable/sql"
import {
  acquireSessionWriteClaim,
  decodeRunEffect,
  type ClaimedRun,
  type RunRow,
  type SqlClaimMechanics,
} from "../../runtime/sql-driver.js"
import { RuntimeUnavailable } from "../../runtime/errors.js"
import { NOTIFY_CHANNEL } from "../schema.js"

const wakeupChanges = (pg: PgClient.PgClient, source: string) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const listenerId = ((yield* Random.nextInt) >>> 0).toString(16)
      const applicationName = `generalist-runtime-worker:${listenerId}:${source}`.slice(0, 63)
      const listener = yield* PgClient.make({ ...pg.config, applicationName, maxConnections: 1 }).pipe(
        Effect.provideServiceEffect(Reactivity.Reactivity, Reactivity.make),
      )
      // The pinned @effect/sql-pg swallows listener `error`/`end`, so liveness is probed through
      // pg_stat_activity. PID discovery yields instead of sleeping because LISTEN is issued
      // concurrently and callers may run under TestClock.
      const health = Stream.unwrap(
        Effect.gen(function* () {
          let listenerPid: number | undefined
          while (listenerPid === undefined) {
            const rows = yield* pg<{ readonly pid: number }>`
            SELECT pid FROM pg_stat_activity
            WHERE application_name = ${applicationName} AND query LIKE ${`LISTEN %${NOTIFY_CHANNEL}%`}
            ORDER BY backend_start DESC LIMIT 1
          `
            listenerPid = rows[0]?.pid
            if (listenerPid === undefined) yield* Effect.yieldNow
          }
          const check = pg<{ readonly present: boolean }>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = ${listenerPid}) AS present
        `.pipe(
            Effect.flatMap((rows) =>
              rows[0]?.present === true
                ? Effect.void
                : RuntimeUnavailable.make({ message: `PostgreSQL RunClaims wakeup listener failed (${source})` }),
            ),
          )
          return Stream.concat(
            Stream.succeed(undefined),
            Stream.fromEffect(check).pipe(Stream.repeat(Schedule.spaced("1 second")), Stream.drain),
          )
        }),
      )
      return Stream.merge(listener.listen(NOTIFY_CHANNEL).pipe(Stream.map(() => undefined)), health)
    }),
  ).pipe(
    Stream.mapError((error) =>
      RuntimeUnavailable.make({ message: `PostgreSQL RunClaims wakeup listener failed (${source}): ${error.message}` }),
    ),
  )

/** PostgreSQL's optimized claim/lease protocol; lifecycle transitions remain in Runtime. */
export const postgresClaimMechanics = (input: {
  readonly pg: PgClient.PgClient
  readonly source: string
}): SqlClaimMechanics => ({
  changes: wakeupChanges(input.pg, input.source),
  claimReadyRuns: (options) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const leaseMs = Duration.toMillis(options.lease ?? "30 seconds")
      const claimed = yield* sql<RunRow & { readonly started_attempt: boolean }>`
        WITH eligible AS (
          SELECT
            r.run_id,
            r.session_id,
            r.accepted_sequence,
            ROW_NUMBER() OVER (PARTITION BY r.session_id ORDER BY r.accepted_sequence ASC) AS session_rank
          FROM generalist_runs r
          WHERE r.status IN ('queued', 'running', 'cancelling')
            AND (
              (r.cancellation_requested = TRUE AND r.status = 'cancelling')
              OR (
                r.cancellation_requested = FALSE
                AND (
                  (r.parent_run_id IS NULL AND
                    (r.status = 'running' OR EXISTS (SELECT 1 FROM generalist_lanes l WHERE l.head_run_id = r.run_id)))
                  OR EXISTS (
                    SELECT 1 FROM generalist_run_links link
                    WHERE link.child_run_id = r.run_id AND link.readiness = 'ready'
                  )
                )
              )
            )
            AND (r.owner_worker_id IS NULL OR r.lease_expires_at IS NULL OR r.lease_expires_at < NOW())
            AND NOT EXISTS (
              SELECT 1 FROM generalist_sessions s
              WHERE s.session_id = r.session_id
                AND s.writer_run_id IS NOT NULL
                AND s.writer_run_id <> r.run_id
            )
        ), candidates AS (
          SELECT r.run_id, r.status = 'queued' AS started_attempt
          FROM generalist_runs r
          INNER JOIN eligible e ON e.run_id = r.run_id
          WHERE e.session_rank = 1
          ORDER BY e.accepted_sequence ASC
          FOR UPDATE OF r SKIP LOCKED
          LIMIT ${options.limit}
        )
        UPDATE generalist_runs AS r
        SET
          owner_worker_id = ${options.workerId},
          lease_expires_at = NOW() + (${leaseMs}::double precision * INTERVAL '1 millisecond'),
          attempt_fence = r.attempt_fence + 1,
          attempt = CASE WHEN r.status = 'queued' THEN r.attempt + 1 ELSE r.attempt END,
          status = CASE WHEN r.status = 'queued' THEN 'running' ELSE r.status END,
          updated_at = NOW()
        FROM candidates c
        WHERE r.run_id = c.run_id
        RETURNING r.*, c.started_attempt
      `
      const out: Array<ClaimedRun & { readonly startedAttempt: boolean }> = []
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
          startedAttempt: row.started_attempt,
          workerId: options.workerId,
          attemptFence: run.attemptFence,
          session,
          leaseExpiresAt: DateTime.toDate(DateTime.makeUnsafe(run.leaseExpiresAt ?? (yield* Clock.currentTimeMillis))),
        })
      }
      return out
    }),
  refreshLease: (options) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const leaseMs = Duration.toMillis(options.lease ?? "30 seconds")
      const rows = yield* sql<{ readonly run_id: string }>`
        UPDATE generalist_runs
        SET
          lease_expires_at = NOW() + (${leaseMs}::double precision * INTERVAL '1 millisecond'),
          updated_at = NOW()
        WHERE run_id = ${options.runId}
          AND owner_worker_id = ${options.workerId}
          AND attempt_fence = ${options.attemptFence}
          AND cancellation_requested = ${options.cancellationRequested}
          AND status NOT IN ('succeeded', 'failed', 'cancelled')
        RETURNING run_id
      `
      return rows.length > 0
    }),
})
