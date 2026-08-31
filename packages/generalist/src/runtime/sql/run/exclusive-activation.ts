import { Clock, Effect, Function, Metric } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { RuntimeUnavailable } from "../../errors.js"
import { LocalScheduler } from "../../execution/local-scheduler.js"
import { RunExecutor } from "../../execution/run-executor.js"
import type { RunActivationProjection } from "../../run/activation.js"
import { RunStore } from "../../run/store.js"

/** @experimental Transaction-local callback which rearms a host wake mechanism. */
export type Rearm = Effect.Effect<void, RuntimeUnavailable>

const unavailable = (cause: unknown) =>
  RuntimeUnavailable.make({ message: `activation projection failed: ${String(cause)}` })

/** @experimental Create the durable candidate projection schema for an exclusive SQLite Runtime host. */
export const createSchema = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS generalist_activations (
    run_id TEXT PRIMARY KEY,
    intent TEXT NOT NULL CHECK (intent IN ('execute', 'cancel')),
    due_at_millis INTEGER NOT NULL,
    attempt_fence INTEGER NOT NULL,
    run_status TEXT NOT NULL
  )`
  yield* sql`CREATE INDEX IF NOT EXISTS generalist_activations_due
    ON generalist_activations(due_at_millis, run_id)`
})

/** @experimental Construct the durable candidate projection over the current SQL transaction. */
export const makeProjection: {
  (sqlClient: SqlClient.SqlClient, rearm: Rearm): RunActivationProjection
  (rearm: Rearm): (sqlClient: SqlClient.SqlClient) => RunActivationProjection
} = Function.dual(
  2,
  (sqlClient: SqlClient.SqlClient, rearm: Rearm): RunActivationProjection => ({
    applyInTransaction: (changes) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const now = yield* Clock.currentTimeMillis
        for (const change of changes) {
          if (change.intent === "inactive") {
            yield* sql`DELETE FROM generalist_activations WHERE run_id = ${change.runId}`
          } else {
            yield* sql`INSERT INTO generalist_activations
              (run_id, intent, due_at_millis, attempt_fence, run_status)
            VALUES (${change.runId}, ${change.intent}, ${now}, ${change.attemptFence}, ${change.runStatus})
            ON CONFLICT(run_id) DO UPDATE SET
              intent = excluded.intent,
              due_at_millis = excluded.due_at_millis,
              attempt_fence = excluded.attempt_fence,
              run_status = excluded.run_status`
          }
        }
        yield* rearm
      }).pipe(Effect.provideService(SqlClient.SqlClient, sqlClient), Effect.mapError(unavailable)),
  }),
)

/** @experimental Create, backfill, and rearm durable candidates in the caller's transaction. */
export const initialize = (rearm: Rearm): Effect.Effect<void, RuntimeUnavailable, SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const now = yield* Clock.currentTimeMillis
    yield* createSchema
    yield* sql`DELETE FROM generalist_activations`
    yield* sql`INSERT INTO generalist_activations
        (run_id, intent, due_at_millis, attempt_fence, run_status)
      SELECT r.run_id,
        CASE WHEN r.status = 'cancelling' THEN 'cancel' ELSE 'execute' END,
        ${now},
        r.attempt_fence,
        r.status
      FROM generalist_runs r LEFT JOIN generalist_run_links l ON l.child_run_id = r.run_id
      WHERE r.status = 'cancelling'
        OR (r.owner_worker_id IS NULL AND
          (r.status = 'running' OR
            (r.status = 'queued' AND r.parent_run_id IS NOT NULL AND l.readiness = 'ready')))`
    yield* rearm
  }).pipe(Effect.mapError(unavailable))

/** @experimental Earliest durable candidate wake. */
export const nextDueAt = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient
  const rows = yield* sql<{ due_at_millis: number | null }>`
    SELECT MIN(due_at_millis) AS due_at_millis FROM generalist_activations
  `
  return rows[0]?.due_at_millis ?? undefined
})

/** @experimental */
export interface DrainOptions {
  readonly ownerId: string
  readonly fuel: number
  readonly cancelRetryMillis?: number
  readonly rearm: Rearm
}

/** @experimental */
export interface DrainResult {
  readonly processed: number
  readonly hasMore: boolean
  readonly nextDueAt?: number
  readonly outcomes: ReadonlyArray<{
    readonly runId: string
    readonly outcome: "executed" | "cancelled" | "deferred" | "inactive" | "stale"
  }>
}

interface Candidate {
  readonly run_id: string
  readonly intent: "execute" | "cancel"
  readonly due_at_millis: number
}

const drainDuration = Metric.timer("generalist_runtime_sqlite_activation_drain_duration", {
  description: "Exclusive SQLite Runtime activation drain duration",
  attributes: { backend: "sqlite-exclusive-host" },
})

const drainSize = Metric.histogram("generalist_runtime_sqlite_activation_drain_size", {
  description: "Exclusive SQLite Runtime activations processed per drain",
  attributes: { backend: "sqlite-exclusive-host" },
  boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 16 }),
})

const drainOutcomes = Metric.frequency("generalist_runtime_sqlite_activation_drain_outcomes", {
  description: "Exclusive SQLite Runtime activation drain outcomes",
  attributes: { backend: "sqlite-exclusive-host" },
  preregisteredWords: ["executed", "cancelled", "deferred", "inactive", "stale"],
})

const rearms = Metric.counter("generalist_runtime_sqlite_activation_rearms", {
  description: "Exclusive SQLite Runtime activation wake rearms",
  attributes: { backend: "sqlite-exclusive-host" },
  incremental: true,
})

/** @experimental Drain a deterministic bounded batch; authoritative claiming follows candidate reads. */
export const drain = (
  options: DrainOptions,
): Effect.Effect<
  DrainResult,
  RuntimeUnavailable | SqlError.SqlError,
  SqlClient.SqlClient | RunStore | RunExecutor | LocalScheduler
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const store = yield* RunStore
    const executor = yield* RunExecutor
    const scheduler = yield* LocalScheduler
    const now = yield* Clock.currentTimeMillis
    const fuel = Math.max(0, Math.floor(options.fuel))
    const candidates = yield* sql<Candidate>`
      SELECT run_id, intent, due_at_millis FROM generalist_activations
      WHERE due_at_millis <= ${now}
      ORDER BY due_at_millis, run_id LIMIT ${fuel + 1}
    `
    const selected = candidates.slice(0, fuel)
    const outcomes: Array<DrainResult["outcomes"][number]> = []
    for (const candidate of selected) {
      if (candidate.intent === "execute") {
        const outcome = yield* store.claimExecution({ runId: candidate.run_id, ownerId: options.ownerId }).pipe(
          Effect.flatMap(executor.execute),
          Effect.as("executed" as const),
          Effect.catchTags({
            "generalist/runtime/StaleClaim": () => Effect.succeed("stale" as const),
            "generalist/runtime/RunNotFound": () =>
              sql`DELETE FROM generalist_activations WHERE run_id = ${candidate.run_id}`.pipe(
                Effect.as("inactive" as const),
              ),
            "generalist/runtime/RunTerminal": () =>
              sql`DELETE FROM generalist_activations WHERE run_id = ${candidate.run_id}`.pipe(
                Effect.as("inactive" as const),
              ),
          }),
        )
        outcomes.push({ runId: candidate.run_id, outcome })
      } else {
        const reconciliation = yield* scheduler.reconcileCancellation(candidate.run_id)
        const outcome = reconciliation === "settled" ? ("cancelled" as const) : reconciliation
        outcomes.push({ runId: candidate.run_id, outcome })
        if (reconciliation === "inactive") {
          yield* sql`DELETE FROM generalist_activations WHERE run_id = ${candidate.run_id}`
        } else if (reconciliation === "deferred" || reconciliation === "stale") {
          const retryAt = now + Math.max(1, options.cancelRetryMillis ?? 250)
          yield* sql`UPDATE generalist_activations SET due_at_millis = ${retryAt}
            WHERE run_id = ${candidate.run_id} AND intent = 'cancel'`
        }
      }
    }
    yield* Metric.update(drainSize, selected.length)
    yield* Effect.forEach(outcomes, ({ outcome }) => Metric.update(drainOutcomes, outcome), { discard: true })
    yield* options.rearm
    yield* Metric.update(rearms, 1)
    const due = yield* sql<{
      due_at_millis: number | null
    }>`SELECT MIN(due_at_millis) AS due_at_millis FROM generalist_activations`
    const result: DrainResult = {
      processed: selected.length,
      hasMore: candidates.length > fuel,
      outcomes,
    }
    if (due[0]?.due_at_millis != null) return { ...result, nextDueAt: due[0].due_at_millis }
    return result
  }).pipe(Effect.trackDuration(drainDuration))
