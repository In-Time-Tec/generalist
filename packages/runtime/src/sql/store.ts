import { Effect, Layer } from "effect"
import type { Scope } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { CursorExpired, RunNotFound } from "../errors.js"
import type { LayerOptions } from "../runtime.js"
import { RunStore, type Interface as RunStoreInterface } from "../run-store.js"
import {
  MultiWorkerUnsupported,
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "./errors.js"
import { migrate } from "./migrate.js"
import { admitSend, admitSpawn } from "./store-admit.js"
import { cancel, complete, emitAgentEvent, fail, respond, resume, signal, suspend } from "./store-control.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  completeOperation,
  resolveOperation,
} from "./store-operations.js"
import { decodeRunEffect, loadEventsAfter, loadRun, loadRunWait } from "./store-helpers.js"
import { claimExecution, loadExecution, requireExecutionClaim, saveExecution } from "./store-execution.js"
import { withSql } from "./sql-effect.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "./store-steering.js"
import { makeEventHub } from "./subscribers.js"
import { admitFanOut, inspectFanOut } from "./store-fan-out.js"
import { loadTreeHistory } from "./tree-history.js"
import { loadRunSnapshot, loadTreeInspection } from "./inspection.js"

export interface SqliteStoreOptions extends LayerOptions {
  readonly filename: string
  readonly multiWorker?: boolean
  readonly workers?: number
}

export type SqliteStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaMigrationFailed
  | MultiWorkerUnsupported

export const makeSqliteRunStore = (
  options: SqliteStoreOptions,
): Effect.Effect<RunStoreInterface, SqliteStoreError, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function* () {
    if (options.multiWorker === true || (options.workers !== undefined && options.workers > 1)) {
      return yield* MultiWorkerUnsupported.make({
        backend: "sqlite",
        message: "SQLite RunStore is single-process only",
      })
    }
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    yield* migrate(options.filename)
    const hub = yield* makeEventHub()
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, sql.withTransaction(effect))
    const runNoTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, effect)
    const runBuffered = <A, E>(makeEffect: (transactionHub: typeof hub) => Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.gen(function* () {
        const events: Array<readonly [string, import("../run-event.js").RunEvent]> = []
        const transactionHub: typeof hub = {
          ...hub,
          publish: (runId, event) => Effect.sync(() => void events.push([runId, event])),
        }
        const result = yield* run(makeEffect(transactionHub))
        yield* Effect.forEach(events, ([runId, event]) => hub.publish(runId, event), { discard: true })
        return result
      })
    const fenced = <A, E>(
      input: import("../run-store.js").ExecutionClaim,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => run(requireExecutionClaim(input).pipe(Effect.andThen(effect)))

    return RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "sqlite", multiWorker: false }),
      admitSend: (input) => run(admitSend(hub, addressBindings, input)),
      admitSpawn: (input) => run(admitSpawn(hub, input)),
      events: (input) =>
        hub.subscribe({
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
        }),
      respond: (input) => run(respond(hub, input)),
      signal: (input) => run(signal(hub, input)),
      cancel: (input) => runBuffered((transactionHub) => cancel(transactionHub, input)),
      admitSteering: (input) => run(admitSteering(input)),
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
              executableRef: loaded.executableRef,
              executableManifest: loaded.executableManifest,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
              ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
              ...(activeWait === undefined ? {} : { wait: activeWait }),
            }
          }),
        ),
      snapshot: (runId) => run(loadRunSnapshot(runId)),
      inspectTree: (rootRunId) => run(loadTreeInspection(rootRunId)),
      history: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(input.runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
            if (input.cursor < -1 || input.cursor > loaded.lastSequence) {
              return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
            }
            return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
          }),
        ),
      treeHistory: (input) => runNoTxn(loadTreeHistory(input)),
      list: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const rows =
              input.status === undefined
                ? yield* sql<
                    import("./rows.js").RunRow
                  >`SELECT * FROM baton_runs ORDER BY created_at DESC LIMIT ${input.limit}`
                : yield* sql<
                    import("./rows.js").RunRow
                  >`SELECT * FROM baton_runs WHERE status = ${input.status} ORDER BY created_at DESC LIMIT ${input.limit}`
            return yield* Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const loaded = yield* decodeRunEffect(row)
                const activeWait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
                return {
                  runId: loaded.runId,
                  status: loaded.status,
                  executableRef: loaded.executableRef,
                  executableManifest: loaded.executableManifest,
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
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(
            Effect.andThen(saveCompletionContinuation(input.runId, input.result)),
            Effect.flatMap((continuation) =>
              continuation === undefined
                ? complete(transactionHub, input).pipe(
                    Effect.as({ _tag: "Completed" } as import("../run-store.js").CompletionOutcome),
                  )
                : Effect.succeed({
                    _tag: "SteeringPending",
                    continuation,
                  } as import("../run-store.js").CompletionOutcome),
            ),
          ),
        ),
      fail: (input) =>
        runBuffered((transactionHub) => requireExecutionClaim(input).pipe(Effect.andThen(fail(transactionHub, input)))),
      suspend: (input) => fenced(input, suspend(hub, input)),
      resume: (input) => run(resume(hub, input)),
      emitAgentEvent: (input) => fenced(input, emitAgentEvent(hub, input)),
      recordOperation: (input) => fenced(input, recordOperation(hub, input)),
      startOperation: (input) => fenced(input, startOperation(input)),
      completeOperation: (input) => fenced(input, completeOperation(hub, input)),
      expireRunningOperation: (input) => fenced(input, expireRunningOperation(hub, input)),
      getOperation: (input) => runNoTxn(getOperation(input)),
      getOperationByKey: (input) => runNoTxn(getOperationByKey(input)),
      resolveOperation: (input) => run(resolveOperation(input, "running")),
      claimExecution: (input) => run(claimExecution(input)),
      loadExecution: (runId) => runNoTxn(loadExecution(runId)),
      saveExecution: (input) => run(saveExecution(input)),
      admitFanOut: (input) => runBuffered((transactionHub) => admitFanOut(transactionHub, input)),
      inspectFanOut: (fanOutId) => runNoTxn(inspectFanOut(fanOutId)),
    })
  })

export const layerSqliteStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore, SqliteStoreError, SqlClient.SqlClient> => Layer.effect(RunStore, makeSqliteRunStore(options))
