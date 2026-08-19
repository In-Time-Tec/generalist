import { Clock, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import type { RunActivationProjection } from "tenetkit/runtime/driver/run-activation"

/** @experimental Transaction-local callback which arms the shared host alarm. */
export type Rearm = () => Effect.Effect<void, RuntimeUnavailable>

const unavailable = (cause: unknown) =>
  RuntimeUnavailable.make({ message: `activation projection failed: ${String(cause)}` })

/** @experimental Adapter-owned activation schema. */
export const schema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS tenetkit_activations (
    run_id TEXT PRIMARY KEY,
    intent TEXT NOT NULL CHECK (intent IN ('execute', 'cancel')),
    due_at_millis INTEGER NOT NULL,
    attempt_fence INTEGER NOT NULL,
    run_status TEXT NOT NULL
  )`
  yield* sql`CREATE INDEX IF NOT EXISTS tenetkit_activations_due
    ON tenetkit_activations(due_at_millis, run_id)`
})

/** @experimental Construct the portable projection implementation over the current SQL transaction. */
export const makeProjection = (sqlClient: SqlClient.SqlClient, rearm: Rearm): RunActivationProjection => ({
  applyInTransaction: (changes) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const now = yield* Clock.currentTimeMillis
      for (const change of changes) {
        if (change.intent === "inactive") {
          yield* sql`DELETE FROM tenetkit_activations WHERE run_id = ${change.runId}`
        } else {
          yield* sql`INSERT INTO tenetkit_activations
              (run_id, intent, due_at_millis, attempt_fence, run_status)
            VALUES (${change.runId}, ${change.intent}, ${now}, ${change.attemptFence}, ${change.runStatus})
            ON CONFLICT(run_id) DO UPDATE SET
              intent = excluded.intent,
              due_at_millis = excluded.due_at_millis,
              attempt_fence = excluded.attempt_fence,
              run_status = excluded.run_status`
        }
      }
      yield* rearm()
    }).pipe(Effect.provideService(SqlClient.SqlClient, sqlClient), Effect.mapError(unavailable)),
})

/** @experimental Create, backfill, and arm adapter candidates in the caller's transaction. */
export const migrateAndBackfill = (rearm: Rearm) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = yield* Clock.currentTimeMillis
    yield* schema
    yield* sql`DELETE FROM tenetkit_activations`
    yield* sql`INSERT INTO tenetkit_activations
        (run_id, intent, due_at_millis, attempt_fence, run_status)
      SELECT r.run_id,
        CASE WHEN r.status = 'cancelling' THEN 'cancel' ELSE 'execute' END,
        ${now},
        r.attempt_fence,
        r.status
      FROM baton_runs r LEFT JOIN baton_run_links l ON l.child_run_id = r.run_id
      WHERE r.status = 'cancelling'
        OR (r.owner_worker_id IS NULL AND
          (r.status = 'running' OR
            (r.status = 'queued' AND r.parent_run_id IS NOT NULL AND l.readiness = 'ready')))`
    yield* rearm()
  })

/** @experimental Earliest TenetKit-owned wake, for use by a host-owned coexistence rearm. */
export const nextDueAt = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ due_at_millis: number | null }>`
    SELECT MIN(due_at_millis) AS due_at_millis FROM tenetkit_activations
  `
  return rows[0]?.due_at_millis ?? undefined
})
