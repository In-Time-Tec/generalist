import { Context, Effect, Random } from "effect"
import { PgClient } from "@effect/sql-pg"
import { SqlClient } from "effect/unstable/sql"
import type { RunEvent } from "../../run-event.js"
import { withSql } from "../sql-effect.js"
import type { EventHub } from "../subscribers.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import type { RunFn } from "./store-ops.js"

const TransactionEvents = Context.Reference<Array<readonly [string, RunEvent]>>(
  "@batonfx/runtime/sql/postgres/TransactionEvents",
  { defaultValue: () => [] },
)

export const makeTransactionRunner = (input: {
  readonly sql: SqlClient.SqlClient
  readonly pg: PgClient.PgClient
  readonly hub: EventHub
}) => {
  const transactionHub: EventHub = {
    ...input.hub,
    publish: (runId, event) =>
      Effect.flatMap(TransactionEvents, (events) => Effect.sync(() => void events.push([runId, event]))),
  }
  const runRaw: RunFn = (effect) =>
    withSql(input.sql, input.sql.withTransaction(effect.pipe(Effect.provideService(PgClient.PgClient, input.pg))))
  const run: RunFn = (effect) =>
    runRaw(
      Effect.gen(function* () {
        const events: Array<readonly [string, RunEvent]> = []
        const result = yield* effect.pipe(Effect.provideService(TransactionEvents, events))
        return [result, events] as const
      }),
    ).pipe(
      Effect.tap(([, events]) =>
        Effect.forEach(
          new Set(events.map(([runId]) => runId)),
          (runId) =>
            input.pg
              .notify(NOTIFY_CHANNEL, runId)
              .pipe(
                Effect.catch((error) =>
                  Effect.logWarning("runtime.postgres.event_notification.failed").pipe(
                    Effect.annotateLogs({ "baton.run.id": runId, "baton.failure": String(error) }),
                  ),
                ),
              ),
          { discard: true },
        ),
      ),
      Effect.map(([result]) => result),
    )
  const runNoTxn: RunFn = (effect) =>
    withSql(input.sql, effect.pipe(Effect.provideService(PgClient.PgClient, input.pg)))
  return { run, runNoTxn, transactionHub }
}

export const nextId = (prefix: string): Effect.Effect<string> =>
  Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(Effect.map((random) => `${prefix}_${random.toString(36)}`))
