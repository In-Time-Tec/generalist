import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "tenetkit/runtime/driver/run-event"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import type { SqlError } from "effect/unstable/sql/SqlError"
import type { RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import type { WithoutSqlError } from "tenetkit/runtime/driver/sql/sql-effect"
import { makeSqlRunner } from "./transaction.js"

export type RunFn = <A, E>(
  effect: Effect.Effect<A, E | SqlError, SqlClient.SqlClient>,
) => Effect.Effect<A, WithoutSqlError<E | SqlError> | RuntimeUnavailable>

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "tenetkit/runtime/sql/mysql/TransactionEvents",
  { defaultValue: () => [] },
)

export const makeTransactionRunner = (input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub }) => {
  const transactionHub: EventHub = {
    ...input.hub,
    publish: (runId, event) =>
      Effect.flatMap(TransactionEvents, (events) => Effect.sync(() => void events.push([runId, event]))),
  }
  const { run: runRaw, runNoTxn, runInspection } = makeSqlRunner(input.sql)
  const run: RunFn = (effect) =>
    runRaw(
      Effect.gen(function* () {
        const events: Array<readonly [string, RunEvent]> = []
        const result = yield* effect.pipe(Effect.provideService(TransactionEvents, events))
        return [result, events] as const
      }),
    ).pipe(
      Effect.tap(([, events]) =>
        Effect.forEach(events, ([runId, event]) => input.hub.publish(runId, event), { discard: true }),
      ),
      Effect.map(([result]) => result),
    )
  return { run, runNoTxn: runNoTxn as RunFn, runInspection, transactionHub }
}
