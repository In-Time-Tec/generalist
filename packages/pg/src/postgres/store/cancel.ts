import { Effect, Function } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { isTerminal } from "tenetkit/runtime/driver/run"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { hasPendingOperationCancellation, hasUnsettledChild } from "tenetkit/runtime/driver/sql/store/child/settlement"
import { markOperationCancellations } from "tenetkit/runtime/driver/sql/operation-store"
import { afterTerminal, appendEvent, loadRun, settleParent } from "./runtime.js"
import { cancelOwnedFanOuts } from "./fan-out.js"
import { reconcileProgramCancellation } from "tenetkit/runtime/driver/sql/store/program"
import type { DecodedRun } from "tenetkit/runtime/driver/sql/codec/rows"

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

const cancelChildren = (
  input: { readonly sql: SqlClient.SqlClient },
  cancelRun: (
    runId: string,
    reason: string | undefined,
  ) => Effect.Effect<void, RunNotFound | RuntimeUnavailable | SqlError, SqlClient.SqlClient | PgClient.PgClient>,
  runId: string,
  reason: string | undefined,
) =>
  Effect.gen(function* () {
    const linked = yield* input.sql<{ child_run_id: string }>`
      SELECT l.child_run_id FROM tenetkit_run_links l
      LEFT JOIN tenetkit_fan_out_members m ON m.child_run_id = l.child_run_id
      WHERE l.parent_run_id = ${runId} AND m.child_run_id IS NULL
      ORDER BY l.child_run_id ASC
    `
    const owned = yield* cancelOwnedFanOuts(input.sql, runId)
    for (const childRunId of [...linked.map((link) => link.child_run_id), ...owned]) {
      const child = yield* loadRun(childRunId)
      if (child !== undefined && !isTerminal(child.status)) {
        yield* cancelRun(child.runId, reason ?? "parent cancelled")
      }
    }
    return linked.length + owned.length
  })

const settleCancellation = (
  input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub },
  current: DecodedRun,
  reason: string | undefined,
) =>
  Effect.gen(function* () {
    const running = yield* input.sql<{ fan_out_id: string }>`
      SELECT fan_out_id FROM tenetkit_fan_outs WHERE parent_run_id = ${current.runId} AND status = 'running' LIMIT 1
    `
    if (running.length > 0) return
    if (yield* hasPendingOperationCancellation(current.runId)) return
    if (yield* hasUnsettledChild(current.runId)) return
    const event = yield* appendEvent(
      input.hub,
      current,
      { _tag: "RunCancelled", ...(reason === undefined ? undefined : { reason }) },
      "cancelled",
    )
    const settled = (yield* loadRun(current.runId))!
    yield* settleParent(input.hub, settled, event.eventId)
    yield* afterTerminal(input.hub, settled)
  })

const shouldSettleCancellation = (terminal: boolean, executing: boolean, current: DecodedRun): boolean =>
  !terminal && !executing && !isTerminal(current.status)

export const cancelRunFor = (input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub }) => {
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
          { _tag: "RunCancellationRequested", ...(reason === undefined ? undefined : { reason }) },
          needsResolution ? "needs-resolution" : "cancelling",
        )
        current = (yield* loadRun(runId))!
      }
      const marked = terminal ? 0 : yield* markOperationCancellations(runId)
      if (marked > 0 && current.status === "needs-resolution") {
        yield* input.sql`UPDATE tenetkit_runs SET status = 'cancelling' WHERE run_id = ${runId}`
        current = (yield* loadRun(runId))!
      }
      if (!terminal) yield* reconcileProgramCancellation(runId, reason ?? current.cancelReason)
      yield* input.sql`
        UPDATE tenetkit_run_waits SET status = 'cancelled', closed_at = NOW()
        WHERE run_id = ${runId} AND status = 'open'
      `
      if ((yield* cancelChildren(input, cancelRun, runId, reason)) > 0) current = (yield* loadRun(runId))!
      if (shouldSettleCancellation(terminal, executing, current)) yield* settleCancellation(input, current, reason)
    })
  return cancelRun
}
