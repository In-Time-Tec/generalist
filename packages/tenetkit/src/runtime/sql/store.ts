import { Context, Effect, Layer, Option, Semaphore, type Scope } from "effect"
import { listRuns } from "./store/list.js"
import { SqlClient } from "effect/unstable/sql"
import { CursorExpired, RunNotFound } from "../errors.js"
import type { LayerOptions } from "../service.js"
import { RunStore, type Service as RunStoreService } from "../run/store.js"
import {
  MultiWorkerUnsupported,
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaVersionUnsupported,
} from "./errors.js"
import { migrate } from "./migrate.js"
import { admitProgramChild, admitSend, admitSpawn, admitStart } from "./store/admit.js"
import { activateRoot } from "./store/activate.js"
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
} from "./store/control.js"
import { cancelSession } from "./store/session.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  completeOperation,
  acknowledgeOperationCancellation,
  commitModelResponse,
  operationCancellations,
} from "./store/operation/operations.js"
import { recoverRunningOperations } from "./store/operation/recovery.js"
import { resolveOperation } from "./store/operation/resolution.js"
import { hasAdmission, loadEventsAfter, loadRun, loadRunWait } from "./store/statements.js"
import { commitInterruptedModelResponse } from "./model-response/interrupted-model-response.js"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "./store/execution.js"
import { withSql } from "./effect.js"
import { make as makeSqliteSessionStore } from "./session/store.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "./store/steering/service.js"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  registerAgentName,
  resolveAddress,
} from "./store/directory.js"
import { make as makeEventHub } from "./subscribers.js"
import { admitFanOut, inspectFanOut } from "./store/fan-out/service.js"
import { loadTreeReplay } from "./tree-replay.js"
import { loadRunSnapshot, loadTreeCheckpoint } from "./inspection/service.js"
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
} from "./store/program.js"
import { ProgramCapabilities } from "../../core/index.js"
import { settlementNotifications } from "./settlement-notifications.js"
import { reconcileCancellationRequested, sessionRoots } from "./session/lifecycle.js"
import { loadChildReadiness } from "./store/child/capacity.js"
import { readRunActivations } from "./run/activation.js"
import {
  acknowledge as acknowledgeExternalChild,
  acknowledgeExternalRootSettlement,
  cancel as cancelExternalChild,
  externalRootOperations,
  externalRootSettlement,
  inspectExternalRoot,
  reserve as reserveExternalChild,
  externalChildSettlement,
} from "./store/child/external.js"
import { ExternalChildStore } from "../child/external/store.js"

export interface SqliteStoreOptions extends LayerOptions {
  readonly source?: string
  readonly multiWorker?: boolean
  readonly workers?: number
}

export type SqliteStoreError =
  | SchemaDirty
  | SchemaChecksumMismatch
  | SchemaVersionUnsupported
  | SchemaMigrationFailed
  | MultiWorkerUnsupported

const makeSqliteStoreServices = (
  options: SqliteStoreOptions,
): Effect.Effect<
  { readonly runStore: RunStoreService; readonly externalChildStore: ExternalChildStore["Service"] },
  SqliteStoreError,
  SqlClient.SqlClient | Scope.Scope
> =>
  Effect.gen(function* () {
    if (options.multiWorker === true || (options.workers !== undefined && options.workers > 1)) {
      return yield* MultiWorkerUnsupported.make({
        backend: "sqlite",
        message: "SQLite RunStore is single-process only",
      })
    }
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const source = options.source ?? "sqlite"
    yield* migrate(source)
    const hub = yield* makeEventHub
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    yield* withSql(sql, reconcileCancellationRequested).pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })),
    )
    const eventCommit = yield* Semaphore.make(1)
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>, touched: ReadonlyArray<string> = []) =>
      withSql(
        sql,
        sql.withTransaction(
          Effect.gen(function* () {
            const result = yield* effect
            if (options.activationProjection !== undefined) {
              const ids = [...new Set(touched)].toSorted()
              const after = yield* readRunActivations(ids)
              const changes = ids.map((runId) => after.get(runId) ?? { runId, intent: "inactive" as const })
              if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes)
            }
            return result
          }),
        ),
      )
    const runProjected = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>, touched: () => Iterable<string>) =>
      withSql(
        sql,
        sql.withTransaction(
          Effect.gen(function* () {
            const result = yield* effect
            if (options.activationProjection !== undefined) {
              const ids = [...new Set(touched())].toSorted()
              const after = yield* readRunActivations(ids)
              const changes = ids.map((runId) => after.get(runId) ?? { runId, intent: "inactive" as const })
              if (changes.length > 0) yield* options.activationProjection.applyInTransaction(changes)
            }
            return result
          }),
        ),
      )
    const runWithoutTransaction = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) => withSql(sql, effect)
    const runBuffered = <A, E>(
      makeEffect: (transactionHub: typeof hub) => Effect.Effect<A, E, SqlClient.SqlClient>,
      touched: ReadonlyArray<string> = [],
    ) =>
      eventCommit.withPermits(1)(
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const events: Array<readonly [string, import("../run/event.js").RunEvent]> = []
            const touchedRuns = new Set(touched)
            const transactionHub: typeof hub = {
              ...hub,
              touchRun: (runId) => Effect.sync(() => void touchedRuns.add(runId)),
              publish: (runId, event) => Effect.sync(() => void events.push([runId, event])),
            }
            const result = yield* restore(
              runProjected(makeEffect(transactionHub), () => [...touchedRuns, ...events.map(([runId]) => runId)]),
            )
            yield* Effect.forEach(events, ([runId, event]) => hub.publish(runId, event), { discard: true })
            return result
          }),
        ),
      )
    const fenced = <A, E>(
      input: import("../run/store.js").ExecutionClaim,
      makeEffect: (transactionHub: typeof hub) => Effect.Effect<A, E, SqlClient.SqlClient>,
    ) =>
      runBuffered(
        (transactionHub) => requireExecutionClaim(input).pipe(Effect.andThen(makeEffect(transactionHub))),
        [input.runId],
      )

    const runStore = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "sqlite", multiWorker: false }),
      sessionStore: (sessionId: string) =>
        withSql(sql, makeSqliteSessionStore({ sessionId })).pipe(Effect.orDie, Effect.map(Option.some)),
      hasAdmission: (input) => runWithoutTransaction(hasAdmission(input)),
      admitSend: (input) => runBuffered((transactionHub) => admitSend(transactionHub, addressBindings, input)),
      admitStart: (input, startOptions) =>
        runBuffered((transactionHub) => admitStart(transactionHub, input, startOptions)),
      activate: (input) => runBuffered((transactionHub) => activateRoot(transactionHub, input.runId), [input.runId]),
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
          loadReplay: runWithoutTransaction(
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
      directory: (runId) => runWithoutTransaction(directory(runId)),
      resolveAddress: (address) => runWithoutTransaction(resolveAddress(address)),
      registerAgentName: (input) => run(registerAgentName(input)),
      listRelated: (runId) => runWithoutTransaction(listRelated(runId)),
      admitMessage: (input) => run(admitMessage(input)),
      pendingMessages: (input) => runWithoutTransaction(pendingMessages(input)),
      settlementNotifications: (input) => runWithoutTransaction(settlementNotifications(input)),
      deliverPendingMessages: (input) => runBuffered((transactionHub) => deliverPendingMessages(transactionHub, input)),
      inspect: (runId) =>
        runWithoutTransaction(
          Effect.gen(function* () {
            const loaded = yield* loadRun(runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId })
            const activeWait = yield* loadRunWait(runId, loaded.activeWaitId)
            const childReadiness = yield* loadChildReadiness(runId)
            const inspection = {
              runId: loaded.runId,
              status: loaded.status,
              executableRef: loaded.executableRef,
              executableManifest: loaded.executableManifest,
              depth: loaded.depth,
              treePolicy: loaded.treePolicy,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
            }
            if (loaded.parentRunId !== undefined) Object.assign(inspection, { parentRunId: loaded.parentRunId })
            if (childReadiness !== undefined) Object.assign(inspection, { childReadiness })
            if (activeWait !== undefined) Object.assign(inspection, { wait: activeWait })
            return inspection
          }),
        ),
      snapshot: (runId) => run(loadRunSnapshot(runId)),
      treeCheckpoint: (rootRunId) => run(loadTreeCheckpoint(rootRunId)),
      sessionRoots: (sessionId) => runWithoutTransaction(sessionRoots(sessionId)),
      history: (input) =>
        runWithoutTransaction(
          Effect.gen(function* () {
            const loaded = yield* loadRun(input.runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
            if (input.cursor < -1 || input.cursor > loaded.lastSequence) {
              return yield* CursorExpired.make({ runId: input.runId, cursor: input.cursor, earliestSequence: 0 })
            }
            return (yield* loadEventsAfter(input.runId, input.cursor)).slice(0, input.limit)
          }),
        ),
      treeReplay: (input) => runWithoutTransaction(loadTreeReplay(input)),
      treeChanges: (rootRunId) => hub.subscribeTree({ rootRunId }),
      list: (input) => runWithoutTransaction(listRuns(input)),
      complete: (input) =>
        runBuffered(
          (transactionHub) =>
            requireExecutionClaim(input).pipe(
              Effect.andThen(saveCompletionContinuation(input.runId, input.result)),
              Effect.flatMap((continuation) =>
                continuation === undefined
                  ? complete(transactionHub, input).pipe(
                      Effect.as<import("../run/store.js").CompletionOutcome>({ _tag: "Completed" }),
                    )
                  : Effect.succeed({
                      _tag: "SteeringPending",
                      continuation,
                    }),
              ),
            ),
          [input.runId],
        ),
      fail: (input) =>
        runBuffered(
          (transactionHub) => requireExecutionClaim(input).pipe(Effect.andThen(fail(transactionHub, input))),
          [input.runId],
        ),
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
      recoverRunningOperations: (input) =>
        fenced(input, (transactionHub) => recoverRunningOperations(transactionHub, input)),
      getOperation: (input) => runWithoutTransaction(getOperation(input)),
      getOperationByKey: (input) => runWithoutTransaction(getOperationByKey(input)),
      operationCancellations: (input) => fenced(input, () => operationCancellations(input)),
      acknowledgeOperationCancellation: (input) => fenced(input, () => acknowledgeOperationCancellation(input)),
      resolveOperation: (input) =>
        runBuffered(
          (transactionHub) =>
            getProgramOperation({ runId: input.runId, operation: input.operationId }).pipe(
              Effect.flatMap((program) =>
                program === undefined ? resolveOperation(input, "running") : resolveProgramOperation(input, "running"),
              ),
              Effect.andThen(settleAdmittedCancellation(transactionHub, input.runId)),
            ),
          [input.runId],
        ),
      claimExecution: (input) => runBuffered((transactionHub) => claimExecution(transactionHub, input), [input.runId]),
      loadExecution: (runId) => runWithoutTransaction(loadExecution(runId)),
      releaseExecution: (input) => run(releaseExecution(input), [input.runId]),
      saveExecution: (input) => run(saveExecution(input)),
      retryExecution: (input) => runBuffered((transactionHub) => retryExecution(transactionHub, input)),
      admitFanOut: (input) => runBuffered((transactionHub) => admitFanOut(transactionHub, input)),
      inspectFanOut: (fanOutId) => runWithoutTransaction(inspectFanOut(fanOutId)),
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
        runBuffered(
          (transactionHub) =>
            requireExecutionClaim(input).pipe(Effect.andThen(settleProgramOperation(transactionHub, input))),
          [input.runId],
        ),
      startProgramOperation: (input) => fenced(input, () => startProgramOperation(input)),
      loadProgramState: (runId) =>
        runWithoutTransaction(
          Effect.gen(function* () {
            const loaded = yield* loadRun(runId)
            if (loaded === undefined) return yield* RunNotFound.make({ runId })
            return yield* loadProgramState(runId)
          }),
        ),
      getProgramOperation: (input) =>
        runWithoutTransaction(
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
    const externalChildStore = ExternalChildStore.of({
      reserve: (input) => runBuffered((transactionHub) => reserveExternalChild(transactionHub, input)),
      acknowledge: (placementId) => run(acknowledgeExternalChild(placementId)),
      settle: (input) => runBuffered((transactionHub) => externalChildSettlement.settle(transactionHub, input)),
      cancel: (placementId) => run(cancelExternalChild(placementId)),
      admitRoot: (input) => runBuffered((transactionHub) => externalRootOperations.admit(transactionHub, input)),
      activateRoot: (placementId) =>
        runBuffered((transactionHub) => externalRootOperations.activate(transactionHub, placementId)),
      inspectRoot: (placementId) => runWithoutTransaction(inspectExternalRoot(placementId)),
      cancelRoot: (placementId, reason) =>
        runBuffered((transactionHub) => externalRootOperations.cancel(transactionHub, placementId, reason)),
      rootSettlement: (placementId) => runWithoutTransaction(externalRootSettlement(placementId)),
      acknowledgeRootSettlement: (input) => run(acknowledgeExternalRootSettlement(input)),
    })
    return { runStore, externalChildStore }
  })

export const makeSqliteRunStore = (
  options: SqliteStoreOptions,
): Effect.Effect<RunStoreService, SqliteStoreError, SqlClient.SqlClient | Scope.Scope> =>
  makeSqliteStoreServices(options).pipe(Effect.map(({ runStore }) => runStore))

export const layerSqliteStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore | ExternalChildStore, SqliteStoreError, SqlClient.SqlClient> =>
  Layer.effectContext(
    makeSqliteStoreServices(options).pipe(
      Effect.map(({ runStore, externalChildStore }) =>
        Context.make(RunStore, runStore).pipe(Context.add(ExternalChildStore, externalChildStore)),
      ),
    ),
  )
