import { Effect, Layer, Option } from "effect"
import { listRuns } from "./store-list.js"
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
import { admitProgramChild, admitSend, admitSpawn, admitStart } from "./store-admit.js"
import {
  cancel,
  complete,
  emitAgentEvent,
  fail,
  respond,
  respondApproval,
  resume,
  settleAdmittedCancellation,
  signal,
  suspend,
} from "./store-control.js"
import { cancelSession } from "./store-session.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  completeOperation,
  commitModelResponse,
  resolveOperation,
} from "./store-operations.js"
import { hasAdmission, loadEventsAfter, loadRun, loadRunWait } from "./store-helpers.js"
import { commitInterruptedModelResponse } from "./interrupted-model-response.js"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "./store-execution.js"
import { withSql } from "./sql-effect.js"
import { makeSqliteSessionStore } from "./session-store.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "./store-steering.js"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  registerAgentName,
  resolveAddress,
} from "./store-directory.js"
import { makeEventHub } from "./subscribers.js"
import { admitFanOut, inspectFanOut } from "./store-fan-out.js"
import { loadTreeHistory } from "./tree-history.js"
import { loadRunSnapshot, loadTreeInspection } from "./inspection.js"
import {
  admitProgramAgents,
  commitProgramLog,
  getProgramOperation,
  loadProgramState,
  reserveProgramOperation,
  resolveProgramOperation,
  suspendProgramOperation,
  settleProgramOperation,
  startProgramOperation,
} from "./store-program.js"
import { ProgramCapabilities } from "@batonfx/core"
import { settlementNotifications } from "./settlement-notifications.js"
import { reconcileCancellationRequested, sessionRoots } from "./session-lifecycle.js"
import { loadChildReadiness } from "./store-child-capacity.js"

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
    const hub = yield* makeEventHub
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    yield* withSql(sql, reconcileCancellationRequested).pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source: options.filename, message: error.message })),
    )
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
      makeEffect: (transactionHub: typeof hub) => Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => runBuffered((transactionHub) => requireExecutionClaim(input).pipe(Effect.andThen(makeEffect(transactionHub))))

    return RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "sqlite", multiWorker: false }),
      sessionStore: (sessionId: string) =>
        withSql(sql, makeSqliteSessionStore({ sessionId })).pipe(Effect.orDie, Effect.map(Option.some)),
      hasAdmission: (input) => runNoTxn(hasAdmission(input)),
      admitSend: (input) => runBuffered((transactionHub) => admitSend(transactionHub, addressBindings, input)),
      admitStart: (input) => runBuffered((transactionHub) => admitStart(transactionHub, input)),
      admitSpawn: (input) => runBuffered((transactionHub) => admitSpawn(transactionHub, input)),
      admitProgramChild: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(Effect.andThen(admitProgramChild(transactionHub, input))),
        ),
      admitProgramChildAndSuspend: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(
            Effect.andThen(admitProgramChild(transactionHub, input)),
            Effect.tap(() => suspend(transactionHub, input)),
          ),
        ),
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
      respond: (input) => runBuffered((transactionHub) => respond(transactionHub, input)),
      respondApproval: (input) => runBuffered((transactionHub) => respondApproval(transactionHub, input)),
      signal: (input) => runBuffered((transactionHub) => signal(transactionHub, input)),
      cancel: (input) => runBuffered((transactionHub) => cancel(transactionHub, input)),
      cancelSession: (input) => runBuffered((transactionHub) => cancelSession(transactionHub, input)),
      admitSteering: (input) => runBuffered((transactionHub) => admitSteering(transactionHub, input)),
      readSteering: (input) => fenced(input, () => readSteering(input)),
      directory: (runId) => runNoTxn(directory(runId)),
      resolveAddress: (address) => runNoTxn(resolveAddress(address)),
      registerAgentName: (input) => run(registerAgentName(input)),
      listRelated: (runId) => runNoTxn(listRelated(runId)),
      admitMessage: (input) => run(admitMessage(input)),
      pendingMessages: (input) => runNoTxn(pendingMessages(input)),
      settlementNotifications: (input) => runNoTxn(settlementNotifications(input)),
      deliverPendingMessages: (input) => runBuffered((transactionHub) => deliverPendingMessages(transactionHub, input)),
      inspect: (runId) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId })
            const activeWait = yield* loadRunWait(runId, loaded.activeWaitId)
            const childReadiness = yield* loadChildReadiness(runId)
            return {
              runId: loaded.runId,
              status: loaded.status,
              executableRef: loaded.executableRef,
              executableManifest: loaded.executableManifest,
              depth: loaded.depth,
              treePolicy: loaded.treePolicy,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
              ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
              ...(childReadiness === undefined ? {} : { childReadiness }),
              ...(activeWait === undefined ? {} : { wait: activeWait }),
            }
          }),
        ),
      snapshot: (runId) => run(loadRunSnapshot(runId)),
      inspectTree: (rootRunId) => run(loadTreeInspection(rootRunId)),
      sessionRoots: (sessionId) => runNoTxn(sessionRoots(sessionId)),
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
      treeChanges: (rootRunId) => hub.subscribeTree({ rootRunId }),
      list: (input) => runNoTxn(listRuns(input)),
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
      suspend: (input) => fenced(input, (transactionHub) => suspend(transactionHub, input)),
      resume: (input) => runBuffered((transactionHub) => resume(transactionHub, input)),
      emitAgentEvent: (input) => fenced(input, (transactionHub) => emitAgentEvent(transactionHub, input)),
      recordOperation: (input) => fenced(input, (transactionHub) => recordOperation(transactionHub, input)),
      startOperation: (input) => fenced(input, () => startOperation(input)),
      completeOperation: (input) => fenced(input, (transactionHub) => completeOperation(transactionHub, input)),
      commitModelResponse: (input) => fenced(input, (transactionHub) => commitModelResponse(transactionHub, input)),
      commitInterruptedModelResponse: (input) =>
        fenced(input, (transactionHub) => commitInterruptedModelResponse(transactionHub, input)),
      expireRunningOperation: (input) =>
        fenced(input, (transactionHub) => expireRunningOperation(transactionHub, input)),
      getOperation: (input) => runNoTxn(getOperation(input)),
      getOperationByKey: (input) => runNoTxn(getOperationByKey(input)),
      resolveOperation: (input) =>
        runBuffered((transactionHub) =>
          getProgramOperation({ runId: input.runId, operation: input.operationId }).pipe(
            Effect.flatMap((program) =>
              program === undefined ? resolveOperation(input, "running") : resolveProgramOperation(input, "running"),
            ),
            Effect.andThen(settleAdmittedCancellation(transactionHub, input.runId)),
          ),
        ),
      claimExecution: (input) => runBuffered((transactionHub) => claimExecution(transactionHub, input)),
      loadExecution: (runId) => runNoTxn(loadExecution(runId)),
      releaseExecution: (input) => run(releaseExecution(input)),
      saveExecution: (input) => run(saveExecution(input)),
      retryExecution: (input) => runBuffered((transactionHub) => retryExecution(transactionHub, input)),
      admitFanOut: (input) => runBuffered((transactionHub) => admitFanOut(transactionHub, input)),
      inspectFanOut: (fanOutId) => runNoTxn(inspectFanOut(fanOutId)),
      reserveProgramOperation: (input) => fenced(input, () => reserveProgramOperation(input)),
      admitProgramAgents: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(Effect.andThen(admitProgramAgents(transactionHub, input, suspend))),
        ),
      suspendProgramOperation: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(Effect.andThen(suspendProgramOperation(transactionHub, input, suspend))),
        ),
      settleProgramOperation: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(Effect.andThen(settleProgramOperation(transactionHub, input))),
        ),
      startProgramOperation: (input) => fenced(input, () => startProgramOperation(input)),
      loadProgramState: (runId) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId })
            return yield* loadProgramState(runId)
          }),
        ),
      getProgramOperation: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* loadRun(input.runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
            return yield* getProgramOperation(input)
          }),
        ),
      completeProgram: (input) =>
        runBuffered((transactionHub) =>
          Effect.gen(function* () {
            yield* requireExecutionClaim(input)
            if (input.outputBytes > input.outputLimit)
              return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
                dimension: "outputBytes",
                limit: input.outputLimit,
              })
            yield* complete(transactionHub, {
              ...input,
              result: { _tag: "Program", value: input.output },
            })
            return { _tag: "Completed" as const }
          }),
        ),
      commitProgramLog: (input) =>
        runBuffered((transactionHub) =>
          requireExecutionClaim(input).pipe(Effect.andThen(commitProgramLog(transactionHub, input))),
        ),
    })
  })

export const layerSqliteStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore, SqliteStoreError, SqlClient.SqlClient> => Layer.effect(RunStore, makeSqliteRunStore(options))
