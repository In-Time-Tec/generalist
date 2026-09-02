import { Context, Effect } from "effect"
import { MultiWorkerUnsupported } from "../../errors.js"
import { apply as applySchema } from "../../migrate.js"
import { readRunActivations } from "../../run/activation.js"
import type { EventHub } from "../../subscribers.js"
import { withSql } from "../../effect.js"
import type { SqliteStoreError, SqliteStoreOptions, SqlStoreDriver, SqlStoreRun, SqlStoreRunner } from "./protocol.js"

/** Bun and Durable Object SQLite transaction and projection mechanics. */
export const sqliteDriver = (options: SqliteStoreOptions): SqlStoreDriver<SqliteStoreError> => ({
  backend: "sqlite",
  multiWorker: false,
  migrate: applySchema,
  initialize: () =>
    options.multiWorker === true || (options.workers !== undefined && options.workers > 1)
      ? MultiWorkerUnsupported.make({
          backend: "sqlite",
          message: "SQLite RunStore is single-process only",
        })
      : Effect.void,
  makeRunner: ({ sql, hub, eventCommit, activationProjection }) => {
    interface TransactionState {
      readonly events: Array<readonly [string, import("../../../run/event.js").RunEvent]>
      readonly hostSessionEvents: Array<readonly [string, import("../../../session/host.js").HostSessionEvent]>
      readonly touched: Set<string>
    }
    const State = Context.Reference<TransactionState>("generalist/runtime/sql/SqliteTransactionState", {
      defaultValue: () => ({ events: [], hostSessionEvents: [], touched: new Set() }),
    })
    const transactionHub: EventHub = {
      ...hub,
      touchRun: (runId) => Effect.flatMap(State, ({ touched }) => Effect.sync(() => void touched.add(runId))),
      publish: (runId, event) =>
        Effect.flatMap(State, ({ events }) => Effect.sync(() => void events.push([runId, event]))),
      publishHostSession: (sessionId, entry) =>
        Effect.flatMap(State, ({ hostSessionEvents }) =>
          Effect.sync(() => void hostSessionEvents.push([sessionId, entry])),
        ),
    }
    const transaction: SqlStoreRunner["transaction"] = (effect) => sql.withTransaction(effect)
    const run: SqlStoreRun = (effect) =>
      eventCommit.withPermits(1)(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const state: TransactionState = { events: [], hostSessionEvents: [], touched: new Set() }
            const result = yield* restore(
              withSql(
                sql,
                transaction(
                  Effect.gen(function* () {
                    const value = yield* effect.pipe(Effect.provideService(State, state))
                    if (activationProjection !== undefined) {
                      const runIds = [
                        ...new Set([...state.touched, ...state.events.map(([runId]) => runId)]),
                      ].toSorted()
                      const after = yield* readRunActivations(runIds)
                      const changes = runIds.map((runId) => after.get(runId) ?? { runId, intent: "inactive" as const })
                      if (changes.length > 0) yield* activationProjection.applyInTransaction(changes)
                    }
                    return value
                  }),
                ),
              ),
            )
            yield* Effect.forEach(state.events, ([runId, event]) => hub.publish(runId, event), { discard: true })
            yield* Effect.forEach(
              state.hostSessionEvents,
              ([sessionId, entry]) => hub.publishHostSession(sessionId, entry),
              { discard: true },
            )
            return result
          }),
        ),
      )
    const runNoTransaction: SqlStoreRun = (effect) => withSql(sql, effect)
    return { run, runNoTransaction, runInspection: run, transaction, transactionHub }
  },
  locks: {
    run: () => Effect.void,
    fence: () => Effect.void,
    hierarchy: () => Effect.void,
    spawn: () => Effect.void,
    admission: () => Effect.void,
    admissionRegistrations: Effect.void,
    registrations: Effect.void,
    mailbox: () => Effect.void,
    fanOut: () => Effect.void,
  },
})
