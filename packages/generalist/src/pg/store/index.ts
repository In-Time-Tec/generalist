import { Effect, Stream } from "effect"
import type { PgClient } from "@effect/sql-pg"
import {
  withConsistentSnapshot,
  withSql,
  type SqlDriverStoreError,
  type SqlRuntimeDriver,
  type SqlStoreOptions,
} from "../../runtime/sql-driver.js"
import { eventStream } from "../events/event-stream.js"
import { transactionRunner } from "../events/transaction-events.js"
import { check as checkSchema } from "../run-schema.js"
import { postgresClaimMechanics } from "../runs/claims.js"
import {
  lockAdmission,
  lockFanOut,
  lockMailbox,
  lockRegistrations,
  lockRun,
  lockRunHierarchy,
  lockRunRow,
} from "../runs/locks.js"
import { NOTIFY_CHANNEL } from "../schema.js"

/** PostgreSQL's physical transaction, lock, claim, and wakeup mechanics. */
export const postgresDriver = (driverInput: {
  readonly options: SqlStoreOptions
  readonly pg: PgClient.PgClient
}): SqlRuntimeDriver<SqlDriverStoreError> => ({
  backend: "postgres",
  multiWorker: true,
  migrate: checkSchema,
  makeRunner: (runnerInput) => {
    const runner = transactionRunner(runnerInput)
    return {
      ...runner,
      runInspection: (effect) => withSql(runnerInput.sql, withConsistentSnapshot(runnerInput.sql, "postgres", effect)),
    }
  },
  locks: {
    run: lockRun,
    fence: lockRunRow,
    hierarchy: lockRunHierarchy,
    spawn: lockRunRow,
    admission: lockAdmission,
    admissionRegistrations: lockRegistrations,
    registrations: lockRegistrations,
    mailbox: lockMailbox,
    fanOut: lockFanOut,
  },
  claims: () =>
    postgresClaimMechanics({
      pg: driverInput.pg,
      source: driverInput.options.source ?? "postgres",
    }),
  events: (eventInput, context) =>
    eventStream({
      hub: context.hub,
      pg: driverInput.pg,
      runId: eventInput.runId,
      cursor: eventInput.cursor,
      capacity: context.capacity,
      loadReplay: context.loadReplay,
      loadAfter: context.loadAfter,
    }),
  treeChanges: (rootRunId, context) =>
    context.hub.subscribeTree({
      rootRunId,
      onSubscribed: driverInput.pg.listen(NOTIFY_CHANNEL).pipe(
        Stream.runForEach((runId) =>
          context.rootForRun(runId).pipe(
            Effect.flatMap((root) => (root === rootRunId ? context.hub.wakeTree(rootRunId) : Effect.void)),
            Effect.ignore,
          ),
        ),
        Effect.ignore,
      ),
    }),
})
