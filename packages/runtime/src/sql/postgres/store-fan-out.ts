import { Effect, Function } from "effect"
import type { PgClient } from "@effect/sql-pg"
import type { SqlClient } from "effect/unstable/sql"
import type { Interface as RunStoreInterface } from "../../run-store.js"
import { admitFanOut, inspectFanOut } from "../store-fan-out.js"
import type { EventHub } from "../subscribers.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import type { WithoutSqlError } from "../sql-effect.js"
import type { SqlError } from "effect/unstable/sql/SqlError"

type SqlR = SqlClient.SqlClient | PgClient.PgClient
export type Run = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlR>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | import("../../errors.js").RuntimeUnavailable>

export const fanOutStoreMethods = (input: {
  readonly sql: SqlClient.SqlClient
  readonly pg: PgClient.PgClient
  readonly hub: EventHub
  readonly run: Run
  readonly runNoTxn: Run
}): Pick<RunStoreInterface, "admitFanOut" | "inspectFanOut"> => ({
  admitFanOut: (fanOut) =>
    input
      .run(
        input.sql`SELECT run_id FROM baton_runs WHERE run_id = ${fanOut.parentRunId} FOR UPDATE`.pipe(
          Effect.andThen(
            input.sql`SELECT pg_advisory_xact_lock(hashtext(${`fanout:${fanOut.parentRunId}:${fanOut.idempotencyKey}`}))`,
          ),
          Effect.andThen(admitFanOut(input.hub, fanOut)),
        ),
      )
      .pipe(
        Effect.tap((receipt) =>
          input.runNoTxn(
            Effect.forEach(
              [receipt.parentRunId, ...receipt.childRunIds],
              (runId) => input.pg.notify(NOTIFY_CHANNEL, runId),
              { discard: true },
            ),
          ),
        ),
      ),
  inspectFanOut: (fanOutId) => input.runNoTxn(inspectFanOut(fanOutId)),
})

export const cancelOwnedFanOuts: {
  (parentRunId: string): (sql: SqlClient.SqlClient) => Effect.Effect<string[], SqlError, never>
  (sql: SqlClient.SqlClient, parentRunId: string): Effect.Effect<string[], SqlError, never>
} = Function.dual(2, (sql: SqlClient.SqlClient, parentRunId: string) =>
  Effect.gen(function* () {
    const owned = yield* sql<{ child_run_id: string }>`
      SELECT m.child_run_id FROM baton_fan_outs f
      JOIN baton_fan_out_members m ON m.fan_out_id = f.fan_out_id
      WHERE f.parent_run_id = ${parentRunId} AND f.status = 'running' ORDER BY m.ordinal ASC
    `
    return owned.map((row) => row.child_run_id)
  }),
)
