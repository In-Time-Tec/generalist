import { Context, Effect, Layer, Option, Semaphore, type Scope } from "effect"
import { listRuns } from "./store/list.js"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { CursorExpired, RunNotFound } from "../errors.js"
import { RunStore, type Service as RunStoreService } from "../run/store.js"
import { SchemaMigrationFailed } from "./errors.js"
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
import { hasAdmission, loadEventsAfter, loadRun, loadRunWaitsByStatus } from "./store/statements.js"
import { commitInterruptedModelResponse } from "./model-response/interrupted-model-response.js"
import {
  claimExecution,
  loadExecution,
  releaseExecution,
  requireExecutionClaim,
  retryExecution,
  saveExecution,
} from "./store/execution.js"
import { claimedStore as sqliteClaimedSessionStore, reader as sqliteSessionReader } from "./session/store.js"
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
import { forBackend } from "./subscribers.js"
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
import { ProgramBudgetExhausted } from "../../core/program/capabilities.js"
import { settlementNotifications } from "./settlement-notifications.js"
import { reconcileCancellationRequested, sessionRoots, sessionRuns } from "./session/lifecycle.js"
import { loadChildReadiness } from "./store/child/capacity.js"
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
import { acknowledge, loadAcknowledged } from "./acknowledgement.js"
import { RunClaims } from "./run/claims.js"
import { layer as activeExecutionsLayer } from "../execution/active-executions.js"
import { layer as modelPreviewLayer } from "../execution/model-response/preview-internal.js"
import { RunExecutor } from "../execution/run-executor.js"
import { make as makeRunExecutor } from "../execution/run-executor-internal.js"
import { layer as runtimeLayer } from "../memory/layer/service.js"
import { Runtime } from "../service.js"
import { sqlClaims } from "./store/kernel/claims.js"
import { SqlObservability } from "./store/kernel/observability.js"
import { sqliteDriver } from "./store/driver/sqlite.js"
import type {
  SqlRuntimeDriver,
  SqlDriverStoreError,
  SqliteStoreError,
  SqliteStoreOptions,
  SqlStoreDriver,
  SqlStoreOptions,
  SqlStoreServices,
} from "./store/driver/protocol.js"

export type {
  SqlClaimMechanics,
  SqlDriverStoreError,
  SqlRuntimeDriver,
  SqliteStoreError,
  SqliteStoreOptions,
  SqlStoreDriver,
  SqlStoreLocks,
  SqlStoreOptions,
  SqlStoreRun,
  SqlStoreRunner,
} from "./store/driver/protocol.js"

const makeSqlStoreServices = <DriverError>(
  options: SqlStoreOptions,
  driver: SqlStoreDriver<DriverError>,
): Effect.Effect<SqlStoreServices, DriverError | SchemaMigrationFailed, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function* () {
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    const source = options.source ?? driver.backend
    yield* SqlObservability.observeMigration(driver.backend, driver.migrate(source))
    if (driver.initialize !== undefined) yield* driver.initialize(source)
    const hub = yield* forBackend(driver.backend)
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    const eventCommit = yield* Semaphore.make(1)
    const runner = driver.makeRunner({
      sql,
      hub,
      eventCommit,
      ...(options.activationProjection === undefined
        ? undefined
        : { activationProjection: options.activationProjection }),
    })
    const { run, runNoTransaction: runNoTxn, runInspection, transactionHub } = runner
    yield* runNoTxn(reconcileCancellationRequested).pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: error.message })),
    )
    const locks = SqlObservability.observeLocks(driver.backend, driver.locks)
    const locked = <A, E>(
      lock: Effect.Effect<void, SqlError, SqlClient.SqlClient>,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => run(lock.pipe(Effect.andThen(effect)))
    const fencedWith = <A, E>(
      lock: Effect.Effect<void, SqlError, SqlClient.SqlClient>,
      input: import("../run/store.js").ExecutionClaim,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => run(lock.pipe(Effect.andThen(requireExecutionClaim(input)), Effect.andThen(effect)))
    const fenced = <A, E>(
      input: import("../run/store.js").ExecutionClaim,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => fencedWith(locks.fence(input.runId), input, effect)

    const runStore = SqlObservability.observeRunStore(
      driver.backend,
      RunStore.of({
        info: Effect.succeed({ durability: "durable", backend: driver.backend, multiWorker: driver.multiWorker }),
        sessionReader: (sessionId: string) =>
          runNoTxn(sqliteSessionReader(sessionId)).pipe(Effect.orDie, Effect.map(Option.some)),
        claimedSessionStore: (claim) =>
          runNoTxn(
            sqliteClaimedSessionStore({
              claim,
              transaction: runner.transaction,
              observe: (transition, effect) =>
                SqlObservability.observeTransition(driver.backend, transition, { runId: claim.runId }, effect),
            }),
          ).pipe(Effect.orDie, Effect.map(Option.some)),
        hasAdmission: (input) => runNoTxn(hasAdmission(input)),
        admitSend: (input) =>
          locked(
            locks.admission({
              address: input.message.to,
              sessionId: input.message.sessionId,
              idempotencyKey: input.message.idempotencyKey,
              ...(input.runId === undefined ? undefined : { runId: input.runId }),
            }),
            admitSend(transactionHub, addressBindings, input, {
              lockRegistrations: locks.admissionRegistrations,
              promote: !driver.multiWorker,
            }),
          ),
        admitStart: (input, startOptions) =>
          locked(
            locks.registrations,
            admitStart(transactionHub, input, {
              ...startOptions,
              activate: startOptions?.activate ?? true,
            }),
          ),
        activate: (input) =>
          locked(
            locks.run(input.runId),
            transactionHub.touchRun(input.runId).pipe(Effect.andThen(activateRoot(transactionHub, input.runId))),
          ),
        admitSpawn: (input) => locked(locks.spawn(input.parentRunId), admitSpawn(transactionHub, input)),
        admitProgramChild: (input) => fenced(input, admitProgramChild(transactionHub, input)),
        admitProgramChildAndSuspend: (input) =>
          fenced(
            input,
            Effect.forEach(input.children, (child) =>
              admitProgramChild(transactionHub, {
                runId: input.runId,
                ownerId: input.ownerId,
                attemptFence: input.attemptFence,
                session: input.session,
                ...child,
              }),
            ).pipe(Effect.tap(() => suspend(transactionHub, input))),
          ),
        events: (input) => {
          const loadReplay = runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* loadRun(input.runId)
              if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
              const replay = yield* loadEventsAfter(input.runId, input.cursor)
              return { replay, lastSequence: loaded.lastSequence }
            }),
          )
          if (driver.events !== undefined) {
            return driver.events(input, {
              hub,
              capacity,
              runNoTransaction: runNoTxn,
              loadReplay,
              loadAfter: (cursor) => runNoTxn(loadEventsAfter(input.runId, cursor)),
            })
          }
          return hub.subscribe({
            runId: input.runId,
            cursor: input.cursor,
            loadReplay,
            capacity,
          })
        },
        respond: (input) => locked(locks.run(input.runId), respond(transactionHub, input)),
        respondApproval: (input) => locked(locks.run(input.runId), respondApproval(transactionHub, input)),
        signal: (input) => locked(locks.run(input.runId), signal(transactionHub, input)),
        cancel: (input) => locked(locks.hierarchy(input.runId), cancel(transactionHub, input)),
        cancelSession: (input) =>
          run(
            Effect.gen(function* () {
              for (const runId of yield* sessionRuns(input.sessionId)) yield* locks.hierarchy(runId)
              return yield* cancelSession(transactionHub, input)
            }),
          ),
        admitSteering: (input) => locked(locks.run(input.runId), admitSteering(transactionHub, input)),
        readSteering: (input) => fenced(input, readSteering(input)),
        directory: (runId) => runNoTxn(directory(runId)),
        resolveAddress: (address) => runNoTxn(resolveAddress(address)),
        registerAgentName: (input) => locked(locks.run(input.runId), registerAgentName(input)),
        listRelated: (runId) => runNoTxn(listRelated(runId)),
        admitMessage: (input) => locked(locks.mailbox(input.targetSessionId), admitMessage(input)),
        pendingMessages: (input) => runNoTxn(pendingMessages(input)),
        settlementNotifications: (input) => runNoTxn(settlementNotifications(input)),
        deliverPendingMessages: (input) =>
          run(
            locks.run(input.runId).pipe(
              Effect.andThen(directory(input.runId)),
              Effect.flatMap((entry) => locks.mailbox(entry.sessionId)),
              Effect.andThen(deliverPendingMessages(transactionHub, input)),
            ),
          ),
        inspect: (runId) =>
          runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* loadRun(runId)
              if (loaded === undefined) return yield* RunNotFound.make({ runId })
              const waits = yield* loadRunWaitsByStatus(runId, "open")
              const childReadiness = yield* loadChildReadiness(runId)
              const inspection = {
                runId: loaded.runId,
                status: loaded.status,
                executableRef: loaded.executableRef,
                executableManifest: loaded.executableManifest,
                depth: loaded.depth,
                treePolicy: loaded.treePolicy,
                waits,
                lastSequence: loaded.lastSequence,
                durability: "durable" as const,
              }
              if (loaded.parentRunId !== undefined) Object.assign(inspection, { parentRunId: loaded.parentRunId })
              if (childReadiness !== undefined) Object.assign(inspection, { childReadiness })
              return inspection
            }),
          ),
        snapshot: (runId) => runInspection(loadRunSnapshot(runId)),
        acknowledge: (input) => locked(locks.run(input.runId), acknowledge(input)),
        acknowledged: (runId) => runNoTxn(loadAcknowledged(runId)),
        treeCheckpoint: (rootRunId) => runInspection(loadTreeCheckpoint(rootRunId)),
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
        treeReplay: (input) => runNoTxn(loadTreeReplay(input)),
        treeChanges: (rootRunId) =>
          driver.treeChanges?.(rootRunId, {
            hub,
            rootForRun: (runId) => runNoTxn(loadRun(runId)).pipe(Effect.map((storedRun) => storedRun?.rootRunId)),
          }) ?? hub.subscribeTree({ rootRunId }),
        list: (input) => runNoTxn(listRuns(input)),
        complete: (input) =>
          fencedWith(
            locks.hierarchy(input.runId),
            input,
            transactionHub.touchRun(input.runId).pipe(
              Effect.andThen(saveCompletionContinuation(input.runId, input.result)),
              Effect.flatMap((continuation) =>
                continuation === undefined
                  ? complete(transactionHub, input).pipe(
                      Effect.as<import("../run/store.js").CompletionOutcome>({ _tag: "Completed" }),
                    )
                  : Effect.succeed({ _tag: "SteeringPending" as const, continuation }),
              ),
            ),
          ),
        fail: (input) =>
          fencedWith(
            locks.hierarchy(input.runId),
            input,
            transactionHub.touchRun(input.runId).pipe(Effect.andThen(fail(transactionHub, input))),
          ),
        suspend: (input) => fencedWith(locks.run(input.runId), input, suspend(transactionHub, input)),
        resume: (input) => locked(locks.run(input.runId), resume(transactionHub, input)),
        emitAgentEvent: (input) => fenced(input, emitAgentEvent(transactionHub, input)),
        recordOperation: (input) => fenced(input, recordOperation(transactionHub, input)),
        startOperation: (input) => fenced(input, startOperation(input)),
        completeOperation: (input) => fenced(input, completeOperation(transactionHub, input)),
        commitModelResponse: (input) => fenced(input, commitModelResponse(transactionHub, input)),
        commitInterruptedModelResponse: (input) => fenced(input, commitInterruptedModelResponse(transactionHub, input)),
        expireRunningOperation: (input) => fenced(input, expireRunningOperation(transactionHub, input)),
        recoverRunningOperations: (input) => fenced(input, recoverRunningOperations(transactionHub, input)),
        getOperation: (input) => runNoTxn(getOperation(input)),
        getOperationByKey: (input) => runNoTxn(getOperationByKey(input)),
        operationCancellations: (input) => fenced(input, operationCancellations(input)),
        acknowledgeOperationCancellation: (input) => fenced(input, acknowledgeOperationCancellation(input)),
        resolveOperation: (input) =>
          locked(
            locks.hierarchy(input.runId),
            getProgramOperation({ runId: input.runId, operation: input.operationId }).pipe(
              Effect.flatMap((program) =>
                program === undefined
                  ? resolveOperation(input, driver.multiWorker ? "queued" : "running", driver.multiWorker)
                  : resolveProgramOperation(input, driver.multiWorker ? "queued" : "running", driver.multiWorker),
              ),
              Effect.andThen(settleAdmittedCancellation(transactionHub, input.runId)),
            ),
          ),
        claimExecution: (input) =>
          locked(
            locks.run(input.runId),
            transactionHub.touchRun(input.runId).pipe(Effect.andThen(claimExecution(transactionHub, input))),
          ),
        loadExecution: (runId) => runNoTxn(loadExecution(runId)),
        releaseExecution: (input) =>
          locked(
            locks.run(input.runId),
            releaseExecution(input).pipe(Effect.andThen(transactionHub.touchRun(input.runId))),
          ),
        saveExecution: (input) => fenced(input, saveExecution(input)),
        retryExecution: (input) => fencedWith(locks.run(input.runId), input, retryExecution(transactionHub, input)),
        admitFanOut: (input) => locked(locks.fanOut(input), admitFanOut(transactionHub, input)),
        inspectFanOut: (fanOutId) => runNoTxn(inspectFanOut(fanOutId)),
        reserveProgramOperation: (input) => fenced(input, reserveProgramOperation(input)),
        admitProgramAgents: (input) => fenced(input, admitProgramAgents(transactionHub, input, suspend)),
        suspendProgramOperation: (input) => fenced(input, suspendProgramOperation(transactionHub, input, suspend)),
        settleProgramOperation: (input) => fenced(input, settleProgramOperation(transactionHub, input)),
        startProgramOperation: (input) => fenced(input, startProgramOperation(input)),
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
          fencedWith(
            locks.hierarchy(input.runId),
            input,
            Effect.gen(function* () {
              if (input.outputBytes > input.outputLimit)
                return yield* ProgramBudgetExhausted.make({
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
        commitProgramLog: (input) => fenced(input, commitProgramLog(transactionHub, input)),
      }),
    )
    const externalChildStore = SqlObservability.observeExternalChildStore(
      driver.backend,
      ExternalChildStore.of({
        reserve: (input) => run(reserveExternalChild(transactionHub, input)),
        acknowledge: (placementId) => run(acknowledgeExternalChild(placementId)),
        settle: (input) => run(externalChildSettlement.settle(transactionHub, input)),
        cancel: (placementId) => run(cancelExternalChild(placementId)),
        admitRoot: (input) => run(externalRootOperations.admit(transactionHub, input)),
        activateRoot: (placementId) => run(externalRootOperations.activate(transactionHub, placementId)),
        inspectRoot: (placementId) => runNoTxn(inspectExternalRoot(placementId)),
        cancelRoot: (placementId, reason) => run(externalRootOperations.cancel(transactionHub, placementId, reason)),
        rootSettlement: (placementId) => runNoTxn(externalRootSettlement(placementId)),
        acknowledgeRootSettlement: (input) => run(acknowledgeExternalRootSettlement(input)),
      }),
    )
    const claimMechanics = driver.claims?.({ sql, hub, transactionHub })
    const claims =
      claimMechanics === undefined
        ? undefined
        : sqlClaims({
            backend: driver.backend,
            mechanics: claimMechanics,
            run,
            transactionHub,
            locks,
          })
    return { runStore, externalChildStore, ...(claims === undefined ? undefined : { claims }) }
  })

/** @experimental Services constructed by a multi-worker SQL Runtime adapter. */
export type SqlRuntimeServices = Runtime | RunStore | RunClaims | RunExecutor

/** @experimental Assemble one server SQL driver around Runtime's lifecycle kernel. */
export const layerSqlRuntime = (input: {
  readonly options: SqlStoreOptions
  readonly workerId: string
  readonly driver: SqlRuntimeDriver<SqlDriverStoreError>
}): Layer.Layer<SqlRuntimeServices, SqlDriverStoreError, SqlClient.SqlClient> => {
  const services = Layer.effectContext(
    makeSqlStoreServices(input.options, input.driver).pipe(
      Effect.flatMap(({ claims, runStore }) =>
        claims === undefined
          ? SchemaMigrationFailed.make({
              source: input.options.source ?? input.driver.backend,
              message: `${input.driver.backend} SQL driver did not provide claims`,
            })
          : Effect.succeed(Context.make(RunStore, runStore).pipe(Context.add(RunClaims, claims))),
      ),
    ),
  )
  const dependencies = Layer.mergeAll(services, activeExecutionsLayer, modelPreviewLayer)
  const runtime = runtimeLayer(input.options).pipe(Layer.provide(dependencies))
  const host = Layer.effect(
    RunExecutor,
    makeRunExecutor({ workerId: input.workerId, resolver: input.options.resolver }),
  ).pipe(Layer.provide(dependencies))
  return Layer.mergeAll(runtime, host, services)
}

export const makeSqliteRunStore = (
  options: SqliteStoreOptions,
): Effect.Effect<RunStoreService, SqliteStoreError, SqlClient.SqlClient | Scope.Scope> =>
  makeSqlStoreServices(options, sqliteDriver(options)).pipe(Effect.map(({ runStore }) => runStore))

export const layerSqliteStore = (
  options: SqliteStoreOptions,
): Layer.Layer<RunStore | ExternalChildStore, SqliteStoreError, SqlClient.SqlClient> =>
  Layer.effectContext(
    makeSqlStoreServices(options, sqliteDriver(options)).pipe(
      Effect.map(({ runStore, externalChildStore }) =>
        Context.make(RunStore, runStore).pipe(Context.add(ExternalChildStore, externalChildStore)),
      ),
    ),
  )
