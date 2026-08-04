import { Effect } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { EventHub } from "../subscribers.js"
import { afterTerminal, appendEvent, loadRun, settleParent } from "./pg-helpers.js"
import { cancelOwnedFanOuts } from "./store-fan-out.js"

export const deferCancelledFanOutParent = (sql: SqlClient.SqlClient, runId: string) =>
  Effect.gen(function* () {
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${runId} AND status = 'running' LIMIT 1
    `
    if (running.length === 0) return false
    yield* sql`UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${runId}`
    return true
  })

export const makeCancelRun = (input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub }) => {
  const cancelRun = (
    runId: string,
    reason: string | undefined,
  ): Effect.Effect<void, RunNotFound | SqlError, SqlClient.SqlClient | PgClient.PgClient> =>
    Effect.gen(function* () {
      let current = yield* loadRun(runId).pipe(
        Effect.flatMap((run) => (run === undefined ? RunNotFound.make({ runId }) : Effect.succeed(run))),
      )
      if (isTerminal(current.status)) return
      const executing =
        current.ownerWorkerId !== undefined && (current.status === "running" || current.status === "cancelling")
      if (!current.cancellationRequested) {
        yield* appendEvent(
          input.hub,
          current,
          { _tag: "RunCancellationRequested", ...(reason === undefined ? {} : { reason }) },
          "cancelling",
        )
        current = (yield* loadRun(runId))!
      }
      const owned = yield* cancelOwnedFanOuts(input.sql, runId)
      for (const childRunId of owned) {
        const child = yield* loadRun(childRunId)
        if (child !== undefined && !isTerminal(child.status))
          yield* cancelRun(child.runId, reason ?? "parent cancelled")
      }
      if (owned.length > 0) current = (yield* loadRun(runId))!
      if (executing) return
      if (isTerminal(current.status)) return
      const running = yield* input.sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM baton_fan_outs WHERE parent_run_id = ${runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0) return
      const event = yield* appendEvent(
        input.hub,
        current,
        { _tag: "RunCancelled", ...(reason === undefined ? {} : { reason }) },
        "cancelled",
      )
      const settled = (yield* loadRun(runId))!
      yield* settleParent(input.hub, settled, event.eventId)
      yield* afterTerminal(input.hub, settled)
      yield* input.sql`
        UPDATE baton_run_waits SET status = 'cancelled', closed_at = NOW()
        WHERE run_id = ${runId} AND status = 'open'
      `
    })
  return cancelRun
}
