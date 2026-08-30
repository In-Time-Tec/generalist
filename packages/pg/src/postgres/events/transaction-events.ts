import { Context, Effect, Random } from "effect"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RunEvent } from "tenetkit/runtime/driver/run/event"
import { withSql } from "tenetkit/runtime/driver/sql/transactions"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { NOTIFY_CHANNEL } from "../schema.js"
import type { RunTransaction } from "../store/ops.js"

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "tenetkit/runtime/driver/sql/postgres/TransactionEvents",
  { defaultValue: () => [] },
)

/** @experimental Notify event followers through the active SQL connection. */
export const notifyRun = (runId: string): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  SqlClient.SqlClient.pipe(
    Effect.flatMap((sql) => sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${runId})`),
    Effect.asVoid,
  )

export const transactionRunner = (input: {
  readonly sql: SqlClient.SqlClient
  readonly pg: PgClient.PgClient
  readonly hub: EventHub
}) => {
  const transactionHub: EventHub = {
    ...input.hub,
    publish: (runId, event) =>
      Effect.flatMap(TransactionEvents, (events) => Effect.sync(() => void events.push([runId, event]))),
  }
  const runRaw: RunTransaction = (effect) =>
    withSql(input.sql, input.sql.withTransaction(effect.pipe(Effect.provideService(PgClient.PgClient, input.pg))))
  const run: RunTransaction = (effect) =>
    runRaw(
      Effect.gen(function* () {
        const events: Array<readonly [string, RunEvent]> = []
        const result = yield* effect.pipe(Effect.provideService(TransactionEvents, events))
        yield* Effect.forEach(new Set(events.map(([runId]) => runId)), notifyRun, { discard: true })
        return result
      }),
    )
  const runWithoutTransaction: RunTransaction = (effect) =>
    withSql(input.sql, effect.pipe(Effect.provideService(PgClient.PgClient, input.pg)))
  return { run, runWithoutTransaction, transactionHub }
}

export const nextId = (prefix: string): Effect.Effect<string> =>
  Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(Effect.map((random) => `${prefix}_${random.toString(36)}`))
