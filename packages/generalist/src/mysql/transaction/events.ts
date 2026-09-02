import { Context, Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "../../runtime/run/event.js"
import type { EventHub, SqlStoreRunner } from "../../runtime/sql-driver.js"
import type { HostSessionEvent } from "../../runtime/session/host.js"
import { sqlRunner } from "./scope.js"

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "generalist/runtime/sql/mysql/TransactionEvents",
  { defaultValue: () => [] },
)
const TransactionHostSessionEvents = Context.Reference<Array<readonly [string, HostSessionEvent]>>(
  "generalist/runtime/sql/mysql/TransactionHostSessionEvents",
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
    publishHostSession: (sessionId, entry) =>
      Effect.flatMap(TransactionHostSessionEvents, (events) => Effect.sync(() => void events.push([sessionId, entry]))),
  }
  const { run: runRaw, runInspection, runNoTxn, transaction } = sqlRunner(input.sql)
  const run: SqlStoreRunner["run"] = (effect) =>
    runRaw(
      Effect.gen(function* () {
        const events: Array<readonly [string, RunEvent]> = []
        const hostSessionEvents: Array<readonly [string, HostSessionEvent]> = []
        const result = yield* effect.pipe(
          Effect.provideService(TransactionEvents, events),
          Effect.provideService(TransactionHostSessionEvents, hostSessionEvents),
        )
        return [result, events, hostSessionEvents] as const
      }),
    ).pipe(
      Effect.tap(([, events, hostSessionEvents]) =>
        Effect.all(
          [
            Effect.forEach(events, ([runId, event]) => input.hub.publish(runId, event), { discard: true }),
            Effect.forEach(hostSessionEvents, ([sessionId, entry]) => input.hub.publishHostSession(sessionId, entry), {
              discard: true,
            }),
          ],
          { discard: true },
        ),
      ),
      Effect.map(([result]) => result),
    )
  return { run, runNoTransaction: runNoTxn, runInspection, transaction, transactionHub }
}
