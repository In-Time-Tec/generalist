import { Effect, Function } from "effect"
import type { SqlClient } from "effect/unstable/sql"
import type { Service as RunStoreService } from "tenetkit/runtime/driver/run/store"
import { admitFanOut, inspectFanOut } from "tenetkit/runtime/driver/sql/fan-out"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/transactions"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { notifyRun } from "../events/transaction-events.js"

type SqlR = SqlClient.SqlClient
export type Run = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlR>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | import("tenetkit/runtime/driver/errors").RuntimeUnavailable>

export const fanOutStoreMethods = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
  readonly run: Run
  readonly runWithoutTransaction: Run
}): Pick<RunStoreService, "admitFanOut" | "inspectFanOut"> => ({
  admitFanOut: (fanOut) =>
    input.run(
      input.sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${fanOut.parentRunId} FOR UPDATE`.pipe(
        Effect.andThen(
          input.sql`SELECT pg_advisory_xact_lock(hashtext(${`fanout:${fanOut.parentRunId}:${fanOut.idempotencyKey}`}))`,
        ),
        Effect.andThen(admitFanOut(input.hub, fanOut)),
        Effect.tap((receipt) =>
          Effect.forEach([receipt.parentRunId, ...receipt.childRunIds], notifyRun, { discard: true }),
        ),
      ),
    ),
  inspectFanOut: (fanOutId) => input.runWithoutTransaction(inspectFanOut(fanOutId)),
})

export const cancelOwnedFanOuts: {
  (parentRunId: string): (sql: SqlClient.SqlClient) => Effect.Effect<string[], SqlError, never>
  (sql: SqlClient.SqlClient, parentRunId: string): Effect.Effect<string[], SqlError, never>
} = Function.dual(2, (sql: SqlClient.SqlClient, parentRunId: string) =>
  Effect.gen(function* () {
    const owned = yield* sql<{ child_run_id: string }>`
      SELECT m.child_run_id FROM tenetkit_fan_outs f
      JOIN tenetkit_fan_out_members m ON m.fan_out_id = f.fan_out_id
      WHERE f.parent_run_id = ${parentRunId} AND f.status = 'running' ORDER BY m.ordinal ASC
    `
    return owned.map((row) => row.child_run_id)
  }),
)
