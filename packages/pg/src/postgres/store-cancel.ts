import { Effect, Function } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { isTerminal } from "tenetkit/runtime/driver/run"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { hasUnsettledChild } from "tenetkit/runtime/driver/sql/store-child-settlement"
import { afterTerminal, appendEvent, loadRun, settleParent } from "./pg-helpers.js"
import { cancelOwnedFanOuts } from "./store-fan-out.js"
import { reconcileProgramCancellation } from "tenetkit/runtime/driver/sql/store-program"

export const deferCancelledFanOutParent: {
  (runId: string): (sql: SqlClient.SqlClient) => Effect.Effect<boolean, SqlError, SqlClient.SqlClient>
  (sql: SqlClient.SqlClient, runId: string): Effect.Effect<boolean, SqlError, SqlClient.SqlClient>
} = Function.dual(2, (sql: SqlClient.SqlClient, runId: string) =>
  Effect.gen(function* () {
    const running = yield* sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${runId} AND status = 'running' LIMIT 1
    `
    if (running.length === 0 && !(yield* hasUnsettledChild(runId))) return false
    yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${runId}`
    return true
  }),
)

export const makeCancelRun = (input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub }) => {
  const cancelRun = (
    runId: string,
    reason: string | undefined,
  ): Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient | PgClient.PgClient> =>
    Effect.gen(function* () {
      let current = yield* loadRun(runId).pipe(
        Effect.flatMap((run) => (run === undefined ? RunNotFound.make({ runId }) : Effect.succeed(run))),
      )
      const terminal = isTerminal(current.status)
      const needsResolution = current.status === "needs-resolution"
      const executing =
        current.ownerWorkerId !== undefined && (current.status === "running" || current.status === "cancelling")
      if (!terminal && !current.cancellationRequested) {
        yield* appendEvent(
          input.hub,
          current,
          { _tag: "RunCancellationRequested", ...(reason === undefined ? {} : { reason }) },
          needsResolution ? "needs-resolution" : "cancelling",
        )
        current = (yield* loadRun(runId))!
      }
      if (!terminal) yield* reconcileProgramCancellation(runId, reason ?? current.cancelReason)
      yield* input.sql`
        UPDATE tenetkit_run_waits SET status = 'cancelled', closed_at = NOW()
        WHERE run_id = ${runId} AND status = 'open'
      `
      const linked = yield* input.sql<{ child_run_id: string }>`
        SELECT l.child_run_id FROM tenetkit_run_links l
        LEFT JOIN tenetkit_fan_out_members m ON m.child_run_id = l.child_run_id
        WHERE l.parent_run_id = ${runId} AND m.child_run_id IS NULL
        ORDER BY l.child_run_id ASC
      `
      for (const link of linked) {
        const child = yield* loadRun(link.child_run_id)
        if (child !== undefined && !isTerminal(child.status))
          yield* cancelRun(child.runId, reason ?? "parent cancelled")
      }
      if (linked.length > 0) current = (yield* loadRun(runId))!
      const owned = yield* cancelOwnedFanOuts(input.sql, runId)
      for (const childRunId of owned) {
        const child = yield* loadRun(childRunId)
        if (child !== undefined && !isTerminal(child.status))
          yield* cancelRun(child.runId, reason ?? "parent cancelled")
      }
      if (owned.length > 0) current = (yield* loadRun(runId))!
      if (terminal) return
      if (executing) return
      if (isTerminal(current.status)) return
      const running = yield* input.sql<{ fan_out_id: string }>`
        SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${runId} AND status = 'running' LIMIT 1
      `
      if (running.length > 0) return
      if (yield* hasUnsettledChild(runId)) return
      const event = yield* appendEvent(
        input.hub,
        current,
        { _tag: "RunCancelled", ...(reason === undefined ? {} : { reason }) },
        "cancelled",
      )
      const settled = (yield* loadRun(runId))!
      yield* settleParent(input.hub, settled, event.eventId)
      yield* afterTerminal(input.hub, settled)
    })
  return cancelRun
}
