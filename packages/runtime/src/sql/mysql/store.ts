import { Duration, Effect, Ref, Schedule, Stream } from "effect"
import type { Scope } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { isSqlError, type SqlError } from "effect/unstable/sql/SqlError"
import { CursorExpired, RunNotFound } from "../../errors.js"
import { agentKey } from "../../memory/state.js"
import type { LayerOptions } from "../../runtime.js"
import { RunStore, type Interface as RunStoreInterface } from "../../run-store.js"
import { admitSend, admitSpawn } from "../store-admit.js"
import {
  cancel,
  complete,
  emitAgentEvent,
  fail,
  markOperationUnknown,
  respond,
  resume,
  signal,
} from "../store-control.js"
import {
  expireRunningOperation,
  failOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  succeedOperation,
} from "../store-operations.js"
import { claimExecution, loadExecution, requireExecutionClaim } from "../store-execution.js"
import { appendEvent, decodeRun, loadEventsAfter, loadRun, loadRunWait, nowIso } from "../store-helpers.js"
import type { RunRow } from "../rows.js"
import { withSql } from "../sql-effect.js"
import { makeEventHub } from "../subscribers.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "../store-steering.js"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"
import { check as checkSchema } from "./run-schema.js"
import { makeMysqlClaims } from "./store-claims.js"
import { admitFanOut, inspectFanOut } from "../store-fan-out.js"
import { loadTreeHistory } from "../tree-history.js"

export interface MysqlStoreOptions extends LayerOptions {
  readonly url: string
  readonly source?: string
  readonly maxConnections?: number
  readonly pollInterval?: Duration.Input
}

export type MysqlStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaUpgradeRequired
  | SchemaMigrationFailed

const isDeadlock = (error: unknown): boolean => {
  if (!isSqlError(error)) return false
  const text = `${error.message} ${String(error.reason)}`.toLowerCase()
  return text.includes("deadlock") || text.includes("1213") || text.includes("40001")
}

const initializeReadCommitted = (sql: SqlClient.SqlClient, connections: number) =>
  Effect.scoped(
    Effect.gen(function* () {
      const reserved = yield* Effect.all(
        Array.from({ length: connections }, () => sql.reserve),
        { concurrency: "unbounded" },
      )
      yield* Effect.forEach(
        reserved,
        (connection) =>
          connection.executeUnprepared("SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED", [], undefined),
        { concurrency: "unbounded", discard: true },
      )
    }),
  )

export const makeMysqlServices = (
  options: MysqlStoreOptions,
): Effect.Effect<
  { readonly store: RunStoreInterface; readonly claims: import("../run-claims.js").Interface },
  MysqlStoreError,
  SqlClient.SqlClient | Scope.Scope
> =>
  Effect.gen(function* () {
    const source = options.source ?? "mysql"
    const agentRefs = new Map(options.agents.map((entry) => [agentKey(entry.ref), entry.ref] as const))
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.agent] as const))
    for (const binding of options.addresses) {
      if (!agentRefs.has(agentKey(binding.agent))) {
        return yield* Effect.die(new Error(`address ${binding.address} binds unregistered agent`))
      }
    }
    yield* checkSchema(source)
    const hub = yield* makeEventHub()
    yield* Effect.addFinalizer(() => hub.shutdown)
    const transactionHub: typeof hub = { ...hub, publish: () => Effect.void }
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    const connections = options.maxConnections ?? 10
    if (!Number.isSafeInteger(connections) || connections < 1) {
      return yield* SchemaMigrationFailed.make({ source, message: "MySQL maxConnections must be a positive integer" })
    }
    const versions = yield* sql<{ version: string }>`SELECT VERSION() AS version`.pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
    const majorVersion = Number.parseInt(versions[0]?.version.split(".")[0] ?? "", 10)
    if (!Number.isSafeInteger(majorVersion) || majorVersion < 8) {
      return yield* SchemaMigrationFailed.make({ source, message: "MySQL runtime requires MySQL 8 or newer" })
    }
    yield* initializeReadCommitted(sql, connections).pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
    const isolation = yield* sql<{ isolation: string }>`SELECT @@transaction_isolation AS isolation`.pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
    if (isolation[0]?.isolation !== "READ-COMMITTED") {
      return yield* SchemaMigrationFailed.make({ source, message: "MySQL runtime requires READ COMMITTED" })
    }

    const transaction = <A, E>(
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
      retries = 4,
    ): Effect.Effect<A, E | SqlError, SqlClient.SqlClient> =>
      Effect.suspend(() =>
        sql.withTransaction(effect).pipe(
          Effect.catchIf(
            (error): error is E | SqlError => retries > 0 && isDeadlock(error),
            () => Effect.sleep("10 millis").pipe(Effect.andThen(transaction(effect, retries - 1))),
          ),
        ),
      )
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, transaction(effect))
    const runNoTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, effect)
    const lockRun = (runId: string) => sql`SELECT run_id FROM baton_runs WHERE run_id = ${runId} FOR UPDATE`
    const lockParent = (runId: string) =>
      sql<{ parent_run_id: string | null }>`SELECT parent_run_id FROM baton_runs WHERE run_id = ${runId}`.pipe(
        Effect.flatMap((rows) =>
          rows[0]?.parent_run_id === null || rows[0]?.parent_run_id === undefined
            ? Effect.void
            : lockRun(rows[0].parent_run_id).pipe(Effect.asVoid),
        ),
      )
    const clearClaim = (runId: string) =>
      sql`
        UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL
        WHERE run_id = ${runId} AND status IN ('succeeded', 'failed', 'cancelled')
      `.pipe(Effect.asVoid)
    const fenced = <A, E>(
      input: import("../../run-store.js").ExecutionClaim,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => run(lockRun(input.runId).pipe(Effect.andThen(requireExecutionClaim(input)), Effect.andThen(effect)))
    const lockNamed = <A, E>(key: string, effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      sql`INSERT IGNORE INTO baton_runtime_locks (lock_key) VALUES (${key})`.pipe(
        Effect.andThen(sql`SELECT lock_key FROM baton_runtime_locks WHERE lock_key = ${key} FOR UPDATE`),
        Effect.andThen(effect),
      )
    const wait = (input: Parameters<RunStoreInterface["wait"]>[0]) =>
      Effect.gen(function* () {
        const loaded = yield* loadRun(input.runId)
        if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
        const opened = yield* nowIso
        yield* sql`
          INSERT INTO baton_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
          VALUES (${loaded.runId}, ${input.wait.waitId}, ${input.wait.reason}, 'open', NULL, ${opened}, NULL)
          ON DUPLICATE KEY UPDATE reason = VALUES(reason), status = 'open', response_json = NULL,
            opened_at = VALUES(opened_at), closed_at = NULL
        `
        yield* appendEvent(
          transactionHub,
          loaded,
          { _tag: "RunWaiting", wait: { ...input.wait, openedAt: opened } },
          "waiting",
        )
      })
    const saveExecution = (input: Parameters<RunStoreInterface["saveExecution"]>[0]) =>
      Effect.gen(function* () {
        yield* requireExecutionClaim(input)
        yield* sql`
          UPDATE baton_runs SET
            driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint)}, driver_checkpoint_json),
            suspension_json = COALESCE(${input.suspension === undefined ? null : JSON.stringify(input.suspension)}, suspension_json),
            transcript_json = COALESCE(${input.transcript === undefined ? null : JSON.stringify(input.transcript)}, transcript_json),
            updated_at = ${yield* nowIso}
          WHERE run_id = ${input.runId} AND owner_worker_id = ${input.ownerId} AND attempt_fence = ${input.attemptFence}
        `
      })

    const store = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "mysql", multiWorker: true }),
      admitSend: (input) =>
        run(
          lockNamed(
            `baton:admit:${input.message.to}:${input.message.sessionId}`,
            admitSend(transactionHub, agentRefs, addressBindings, input, { promote: false }),
          ),
        ),
      admitSpawn: (input) =>
        run(lockRun(input.parentRunId).pipe(Effect.andThen(admitSpawn(transactionHub, agentRefs, input)))),
      events: (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const cursor = yield* Ref.make(input.cursor)
            const poll = Ref.get(cursor).pipe(
              Effect.flatMap((after) => runNoTxn(loadEventsAfter(input.runId, after))),
              Effect.flatMap((events) =>
                Effect.forEach(
                  events,
                  (event) => hub.publish(input.runId, event).pipe(Effect.andThen(Ref.set(cursor, event.sequence))),
                  { discard: true },
                ),
              ),
              Effect.ignore,
              Effect.repeat(Schedule.spaced(options.pollInterval ?? "50 millis")),
            )
            return hub.subscribe({
              runId: input.runId,
              cursor: input.cursor,
              loadReplay: runNoTxn(
                Effect.gen(function* () {
                  const loaded = yield* loadRun(input.runId)
                  if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
                  const replay = yield* loadEventsAfter(input.runId, input.cursor)
                  return { replay, lastSequence: loaded.lastSequence }
                }),
              ),
              capacity,
              onSubscribed: poll,
            })
          }),
        ),
      respond: (input) => run(lockRun(input.runId).pipe(Effect.andThen(respond(transactionHub, input)))),
      signal: (input) => run(lockRun(input.runId).pipe(Effect.andThen(signal(transactionHub, input)))),
      cancel: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(lockParent(input.runId)),
            Effect.andThen(cancel(transactionHub, input)),
            Effect.andThen(clearClaim(input.runId)),
          ),
        ),
      admitSteering: (input) => run(lockRun(input.runId).pipe(Effect.andThen(admitSteering(input)))),
      readSteering: (input) => fenced(input, readSteering(input)),
      inspect: (runId) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId })
            const activeWait = yield* loadRunWait(runId, loaded.activeWaitId)
            return {
              runId: loaded.runId,
              status: loaded.status,
              agent: loaded.agent,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
              ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
              ...(activeWait === undefined ? {} : { wait: activeWait }),
            }
          }),
        ),
      history: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(input.runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
            if (input.cursor < -1 || input.cursor > loaded.lastSequence)
              return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
            return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
          }),
        ),
      treeHistory: (input) => runNoTxn(loadTreeHistory(input)),
      list: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const rows =
              input.status === undefined
                ? yield* sql<RunRow>`SELECT * FROM baton_runs ORDER BY created_at DESC LIMIT ${input.limit}`
                : yield* sql<RunRow>`SELECT * FROM baton_runs WHERE status = ${input.status} ORDER BY created_at DESC LIMIT ${input.limit}`
            return yield* Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const loaded = decodeRun(row)
                const activeWait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
                return {
                  runId: loaded.runId,
                  status: loaded.status,
                  agent: loaded.agent,
                  lastSequence: loaded.lastSequence,
                  durability: "durable" as const,
                  ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
                  ...(activeWait === undefined ? {} : { wait: activeWait }),
                }
              }),
            )
          }),
        ),
      complete: (input) =>
        fenced(
          input,
          lockParent(input.runId).pipe(
            Effect.andThen(
              Effect.gen(function* () {
                const continuation = yield* saveCompletionContinuation(input.runId, input.result)
                if (continuation !== undefined) return { _tag: "SteeringPending" as const, continuation }
                yield* complete(transactionHub, input)
                yield* clearClaim(input.runId)
                return { _tag: "Completed" as const }
              }),
            ),
          ),
        ),
      fail: (input) =>
        fenced(
          input,
          lockParent(input.runId).pipe(
            Effect.andThen(fail(transactionHub, input)),
            Effect.andThen(clearClaim(input.runId)),
          ),
        ),
      wait: (input) => fenced(input, wait(input)),
      resume: (input) => run(lockRun(input.runId).pipe(Effect.andThen(resume(transactionHub, input)))),
      emitAgentEvent: (input) => fenced(input, emitAgentEvent(transactionHub, input)),
      markOperationUnknown: (input) => fenced(input, markOperationUnknown(transactionHub, input)),
      recordOperation: (input) => fenced(input, recordOperation(transactionHub, input)),
      startOperation: (input) => fenced(input, startOperation(input)),
      succeedOperation: (input) => fenced(input, succeedOperation(input)),
      failOperation: (input) => fenced(input, failOperation(input)),
      expireRunningOperation: (input) => fenced(input, expireRunningOperation(transactionHub, input)),
      getOperation: (input) => runNoTxn(getOperation(input)),
      getOperationByKey: (input) => runNoTxn(getOperationByKey(input)),
      claimExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(claimExecution(input)))),
      loadExecution: (runId) => runNoTxn(loadExecution(runId)),
      saveExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(saveExecution(input)))),
      admitFanOut: (input) =>
        run(
          lockNamed(
            `baton:fanout:${input.parentRunId}`,
            lockRun(input.parentRunId).pipe(Effect.andThen(admitFanOut(transactionHub, input))),
          ),
        ),
      inspectFanOut: (fanOutId) => runNoTxn(inspectFanOut(fanOutId)),
    })
    return { store, claims: makeMysqlClaims({ sql, hub: transactionHub, run, lockParent, clearClaim }) }
  })
