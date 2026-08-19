import { Clock, Effect } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { ExecutionHost } from "tenetkit/runtime/driver/execution-host"
import { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { LocalScheduler } from "tenetkit/runtime/driver/local-scheduler"
import { RunStore } from "tenetkit/runtime/driver/run-store"
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
  SqlClient.SqlClient | RunStore | ExecutionHost | LocalScheduler
> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const store = yield* RunStore
    const host = yield* ExecutionHost
    const scheduler = yield* LocalScheduler
    const now = yield* Clock.currentTimeMillis
    const fuel = Math.max(0, Math.floor(options.fuel))
    const candidates = yield* sql<Candidate>`
      SELECT run_id, intent, due_at_millis FROM tenetkit_activations
      WHERE due_at_millis <= ${now}
      ORDER BY due_at_millis, run_id LIMIT ${fuel + 1}
    `
    const selected = candidates.slice(0, fuel)
    for (const candidate of selected) {
      if (candidate.intent === "execute") {
        yield* store
          .claimExecution({ runId: candidate.run_id, ownerId: options.ownerId })
          .pipe(
            Effect.flatMap(host.execute),
            Effect.catchTag("tenetkit/runtime/StaleClaim", () => Effect.void),
            Effect.catchTag("tenetkit/runtime/RunNotFound", () =>
              sql`DELETE FROM tenetkit_activations WHERE run_id = ${candidate.run_id}`.pipe(Effect.asVoid),
            ),
            Effect.catchTag("tenetkit/runtime/RunTerminal", () =>
              sql`DELETE FROM tenetkit_activations WHERE run_id = ${candidate.run_id}`.pipe(Effect.asVoid),
            ),
          )
      } else {
        yield* scheduler.reconcileCancellation(candidate.run_id)
        const retryAt = now + Math.max(1, options.cancelRetryMillis ?? 250)
        yield* sql`UPDATE tenetkit_activations SET due_at_millis = ${retryAt}
          WHERE run_id = ${candidate.run_id} AND intent = 'cancel'`
      }
    }
    yield* options.rearm()
    const due = yield* sql<{
      due_at_millis: number | null
    }>`SELECT MIN(due_at_millis) AS due_at_millis FROM tenetkit_activations`
    return {
      processed: selected.length,
      hasMore: candidates.length > fuel,
      ...(due[0]?.due_at_millis == null ? {} : { nextDueAt: Number(due[0].due_at_millis) }),
    }
  })
