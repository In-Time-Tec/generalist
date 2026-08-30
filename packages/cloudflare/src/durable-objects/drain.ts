import { Clock, Effect } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { RunExecutor } from "tenetkit/runtime/driver/execution/run-executor"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { LocalScheduler } from "tenetkit/runtime/driver/execution/local-scheduler"
import { RunStore } from "tenetkit/runtime/driver/run/store"
import type { Rearm } from "./activations.js"

export interface DrainOptions {
  readonly ownerId: string
  readonly fuel: number
  readonly cancelRetryMillis?: number
  readonly rearm: Rearm
}

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

/** @experimental Drain a deterministic bounded batch; claiming and execution occur outside candidate reads. */
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
      SELECT run_id, intent, due_at_millis FROM tenetkit_activations
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
            "tenetkit/runtime/StaleClaim": () => Effect.succeed("stale" as const),
            "tenetkit/runtime/RunNotFound": () =>
              sql`DELETE FROM tenetkit_activations WHERE run_id = ${candidate.run_id}`.pipe(
                Effect.as("inactive" as const),
              ),
            "tenetkit/runtime/RunTerminal": () =>
              sql`DELETE FROM tenetkit_activations WHERE run_id = ${candidate.run_id}`.pipe(
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
          yield* sql`DELETE FROM tenetkit_activations WHERE run_id = ${candidate.run_id}`
        } else if (reconciliation === "deferred" || reconciliation === "stale") {
          const retryAt = now + Math.max(1, options.cancelRetryMillis ?? 250)
          yield* sql`UPDATE tenetkit_activations SET due_at_millis = ${retryAt}
            WHERE run_id = ${candidate.run_id} AND intent = 'cancel'`
        }
      }
    }
    yield* options.rearm
    const due = yield* sql<{
      due_at_millis: number | null
    }>`SELECT MIN(due_at_millis) AS due_at_millis FROM tenetkit_activations`
    const result: DrainResult = {
      processed: selected.length,
      hasMore: candidates.length > fuel,
      outcomes,
    }
    if (due[0]?.due_at_millis != null) return { ...result, nextDueAt: due[0].due_at_millis }
    return result
  })
