import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "../../run-event.js"
import type { EventHub } from "../subscribers.js"
import { makeSqlRunner } from "./transaction.js"

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "@batonfx/runtime/sql/mysql/TransactionEvents",
  { defaultValue: () => [] },
)

export const makeTransactionRunner = (input: { readonly sql: SqlClient.SqlClient; readonly hub: EventHub }) => {
  const transactionHub: EventHub = {
    ...input.hub,
    publish: (runId, event) =>
      Effect.flatMap(TransactionEvents, (events) => Effect.sync(() => void events.push([runId, event]))),
  }
  const { run: runRaw, runNoTxn, runInspection } = makeSqlRunner(input.sql)
  const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
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
  return { run, runNoTxn, runInspection, transactionHub }
}
