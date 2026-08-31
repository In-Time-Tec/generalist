import { Duration, Effect, Ref, Schedule, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import {
  SchemaMigrationFailed,
  type SqlDriverStoreError,
  type SqlRuntimeDriver,
  type SqlStoreLocks,
  type SqlStoreOptions,
} from "generalist/runtime/sql-driver"
import { check as checkSchema } from "../schema/migrations.js"
import { transactionRunner } from "../transaction/events.js"
import { initializeReadCommitted, mysqlClaimMechanics } from "./claims.js"

export interface Options extends SqlStoreOptions {
  readonly url: string
  readonly source?: string
  readonly maxConnections?: number
  readonly pollInterval?: Duration.Input
}

export type RuntimeError = SqlDriverStoreError

const lockRun = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`SELECT run_id FROM generalist_runs WHERE run_id = ${runId} FOR UPDATE`
  })

const lockHierarchy = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(runId)
    const rows = yield* sql<{ parent_run_id: string | null }>`
      SELECT parent_run_id FROM generalist_runs WHERE run_id = ${runId}
    `
    const parentRunId = rows[0]?.parent_run_id
    if (parentRunId !== null && parentRunId !== undefined) yield* lockRun(parentRunId)
  })

const lockNamed = (key: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const held = yield* sql`SELECT lock_key FROM generalist_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
    if (held.length === 0) {
      yield* sql`INSERT IGNORE INTO generalist_runtime_locks (lock_key) VALUES (${key})`
      yield* sql`SELECT lock_key FROM generalist_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
    }
  })

const locks: SqlStoreLocks = {
  run: lockRun,
  fence: lockRun,
  hierarchy: lockHierarchy,
  spawn: lockRun,
  admission: (input) => lockNamed(`generalist:admit:${input.address}:${input.sessionId}`),
  admissionRegistrations: Effect.void,
  registrations: lockNamed("generalist:executable-registrations"),
  mailbox: (sessionId) => lockNamed(`generalist:mailbox:${sessionId}`),
  fanOut: (input) =>
    lockNamed(`generalist:fanout:${input.parentRunId}`).pipe(Effect.andThen(lockRun(input.parentRunId))),
}

/** MySQL's physical transaction, lock, claim, polling, and host initialization mechanics. */
export const mysqlDriver = (options: Options): SqlRuntimeDriver<RuntimeError> => ({
  backend: "mysql",
  multiWorker: true,
  migrate: checkSchema,
  initialize: (source) =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const connections = options.maxConnections ?? 10
      if (!Number.isSafeInteger(connections) || connections < 1) {
        return yield* SchemaMigrationFailed.make({
          source,
          message: "MySQL maxConnections must be a positive integer",
        })
      }
      const versions = yield* sql<{ version: string }>`SELECT VERSION() AS version`.pipe(
        Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })),
      )
      const majorVersion = Number.parseInt(versions[0]?.version.split(".")[0] ?? "", 10)
      if (!Number.isSafeInteger(majorVersion) || majorVersion < 8) {
        return yield* SchemaMigrationFailed.make({ source, message: "MySQL runtime requires MySQL 8 or newer" })
      }
      yield* initializeReadCommitted({ sql, connections }).pipe(
        Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })),
      )
      const isolation = yield* sql<{ isolation: string }>`SELECT @@transaction_isolation AS isolation`.pipe(
        Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })),
      )
      if (isolation[0]?.isolation !== "READ-COMMITTED") {
        return yield* SchemaMigrationFailed.make({ source, message: "MySQL runtime requires READ COMMITTED" })
      }
    }),
  makeRunner: transactionRunner,
  locks,
  claims: () => mysqlClaimMechanics,
  events: (input, context) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const pollCursor = yield* Ref.make(input.cursor)
        const deliveredCursor = yield* Ref.make(input.cursor)
        const poll = Ref.get(pollCursor).pipe(
          Effect.flatMap((cursor) =>
            context.hub.catchUp({
              runId: input.runId,
              cursor,
              loadAfter: context.loadAfter(cursor),
            }),
          ),
          Effect.flatMap((cursor) => Ref.set(pollCursor, cursor)),
          Effect.ignore,
          Effect.repeat(Schedule.spaced(options.pollInterval ?? "50 millis")),
          Effect.asVoid,
        )
        return context.hub
          .subscribe({
            runId: input.runId,
            cursor: input.cursor,
            loadReplay: context.loadReplay,
            capacity: context.capacity,
            onSubscribed: poll,
          })
          .pipe(
            Stream.filterEffect((event) =>
              Ref.modify(deliveredCursor, (cursor) => [event.sequence > cursor, Math.max(cursor, event.sequence)]),
            ),
          )
      }),
    ),
})
