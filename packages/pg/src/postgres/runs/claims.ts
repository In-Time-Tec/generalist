import { Cause, Clock, DateTime, Duration, Effect, Queue, Redacted, Stream } from "effect"
import type { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import { Client, escapeIdentifier, type Notification } from "pg"
import {
  acquireSessionWriteClaim,
  decodeRunEffect,
  type ClaimedRun,
  type RunRow,
  type SqlClaimMechanics,
} from "generalist/runtime/sql-driver"
import { Errors } from "generalist/runtime"
import { NOTIFY_CHANNEL } from "../schema.js"

const wakeupChanges = (config: PgClient.PgClientConfig, source: string) =>
  Stream.callback<void, Errors.RuntimeUnavailable>(
    (queue) => {
      const client = new Client({
        connectionString: config.url === undefined ? undefined : Redacted.value(config.url),
        user: config.username,
        host: config.host,
        database: config.database,
        password: config.password === undefined ? undefined : Redacted.value(config.password),
        ssl: config.ssl,
        port: config.port,
        ...(config.stream === undefined ? undefined : { stream: config.stream }),
        connectionTimeoutMillis:
          config.connectTimeout === undefined ? undefined : Duration.toMillis(config.connectTimeout),
        application_name: `generalist-runtime-worker:${source}`.slice(0, 63),
        types: config.types,
      })
      const failure = (cause: unknown) =>
        Errors.RuntimeUnavailable.make({ message: `PostgreSQL RunClaims wakeup listener failed: ${String(cause)}` })
      const onNotification = (notification: Notification) => {
        if (notification.channel === NOTIFY_CHANNEL) Queue.offerUnsafe(queue, undefined)
      }
      const onFailure = (cause: unknown) => Queue.failCauseUnsafe(queue, Cause.fail(failure(cause)))
      const onEnd = () => onFailure("PostgreSQL listener connection ended")
      const close = Effect.tryPromise(() => client.end()).pipe(Effect.ignore)
      const acquire = Effect.acquireRelease(
        Effect.sync(() => {
          client.on("notification", onNotification)
          client.on("error", onFailure)
          client.on("end", onEnd)
        }),
        () =>
          Effect.sync(() => {
            client.off("notification", onNotification)
            client.off("error", onFailure)
            client.off("end", onEnd)
          }).pipe(Effect.andThen(close)),
      )
      const connect = Effect.tryPromise({
        try: () => client.connect(),
        catch: failure,
      }).pipe(
        Effect.andThen(
          Effect.tryPromise({
            try: () => client.query(`LISTEN ${escapeIdentifier(NOTIFY_CHANNEL)}`),
            catch: failure,
          }),
        ),
        Effect.andThen(Effect.sync(() => Queue.offerUnsafe(queue, undefined))),
      )
      return acquire.pipe(Effect.andThen(connect))
    },
    { bufferSize: 1, strategy: "sliding" },
  )

/** PostgreSQL's optimized claim/lease protocol; lifecycle transitions remain in Runtime. */
export const postgresClaimMechanics = (input: {
  readonly config: PgClient.PgClientConfig
  readonly source: string
}): SqlClaimMechanics => ({
  changes: wakeupChanges(input.config, input.source),
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
