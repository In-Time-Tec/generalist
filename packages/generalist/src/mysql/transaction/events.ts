import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "../../runtime/run/event.js"
import type { EventHub, SqlStoreRunner } from "../../runtime/sql-driver.js"
import { sqlRunner } from "./scope.js"

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "generalist/runtime/sql/mysql/TransactionEvents",
  { defaultValue: () => [] },
)

/** MySQL whole-transaction deadlock retry with one post-commit local publication. */
export const transactionRunner = (input: {
  readonly sql: SqlClient.SqlClient
  readonly hub: EventHub
}): SqlStoreRunner => {
  const transactionHub: EventHub = {
    ...input.hub,
    publish: (runId, event) =>
      Effect.flatMap(TransactionEvents, (events) => Effect.sync(() => void events.push([runId, event]))),
  }
  const { run: runRaw, runInspection, runNoTxn, transaction } = sqlRunner(input.sql)
  const run: SqlStoreRunner["run"] = (effect) =>
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
  return { run, runNoTransaction: runNoTxn, runInspection, transaction, transactionHub }
}
