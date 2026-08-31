import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { withSql, type EventHub, type SqlStoreRunner } from "generalist/runtime/sql-driver"
import { NOTIFY_CHANNEL } from "../schema.js"

interface TransactionState {
  readonly runIds: Set<string>
}

const State = Context.Reference<TransactionState>("generalist/runtime/sql/postgres/TransactionState", {
  defaultValue: () => ({ runIds: new Set() }),
})

/** @experimental Notify event followers through the active SQL transaction connection. */
export const notifyRun = (runId: string): Effect.Effect<void, SqlError, SqlClient.SqlClient> =>
  SqlClient.SqlClient.pipe(
    Effect.flatMap((sql) => sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${runId})`),
    Effect.asVoid,
  )

/** PostgreSQL transaction and post-commit-doorbell strategy for Runtime's SQL kernel. */
export const transactionRunner = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
}): SqlStoreRunner => {
  const transactionHub: EventHub = {
    ...input.hub,
    touchRun: (runId) => Effect.flatMap(State, ({ runIds }) => Effect.sync(() => void runIds.add(runId))),
    publish: (runId) => Effect.flatMap(State, ({ runIds }) => Effect.sync(() => void runIds.add(runId))),
  }
  const transaction: SqlStoreRunner["transaction"] = (effect) => input.sql.withTransaction(effect)
  const run: SqlStoreRunner["run"] = (effect) =>
    withSql(
      input.sql,
      transaction(
        Effect.gen(function* () {
          const state: TransactionState = { runIds: new Set() }
          const result = yield* effect.pipe(Effect.provideService(State, state))
          yield* Effect.forEach(state.runIds, notifyRun, { discard: true })
          return result
        }),
      ),
    )
  const runNoTransaction: SqlStoreRunner["runNoTransaction"] = (effect) => withSql(input.sql, effect)
  return { run, runNoTransaction, runInspection: run, transaction, transactionHub }
}
