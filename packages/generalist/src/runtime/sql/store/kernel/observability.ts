import { Cause, Effect, Exit, Metric, Predicate, Schema } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import { RunStore, type Service as RunStoreService, type StoreBackend } from "../../../run/store.js"
import { ExternalChildStore, type Service as ExternalChildStoreService } from "../../../child/external/store.js"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
  StaleClaim,
  StaleSessionClaim,
} from "../../errors.js"
import { SQL_SCHEMA_VERSION, sqlSchemaChecksum } from "../../schema/contract.js"
import type { SqlStoreLocks } from "../driver/protocol.js"

export type SqlTransitionOutcome = "committed" | "exact-retry" | "divergent-retry" | "stale-claim" | "rolled-back"

export interface SqlTransitionAttributes {
  readonly runId?: string
  readonly operationId?: string
  readonly operationKind?: string
}

interface TransitionObservation {
  readonly active: boolean
  readonly transition: string
  outcome: SqlTransitionOutcome
}

const unobservedTransition: TransitionObservation = {
  active: false,
  transition: "unobserved",
  outcome: "committed",
}
const transitionsByFiber = new Map<number, TransitionObservation>()
const currentTransition = Effect.withFiber((fiber) =>
  Effect.succeed(transitionsByFiber.get(fiber.id) ?? unobservedTransition),
)

const transitionDuration = Metric.timer("generalist_runtime_sql_transition_duration", {
  description: "Runtime SQL semantic transition duration",
})

const transitionOutcomes = Metric.frequency("generalist_runtime_sql_transition_outcomes", {
  description: "Runtime SQL semantic transition outcomes",
  preregisteredWords: ["committed", "exact-retry", "divergent-retry", "stale-claim", "rolled-back"],
})

const lockWaitDuration = Metric.timer("generalist_runtime_sql_lock_wait_duration", {
  description: "Runtime SQL semantic lock acquisition duration",
})

const readyClaimBatchSize = Metric.histogram("generalist_runtime_sql_ready_claim_batch_size", {
  description: "Runtime SQL ready claims returned per batch",
  boundaries: Metric.exponentialBoundaries({ start: 1, factor: 2, count: 16 }),
})

const leaseTakeovers = Metric.counter("generalist_runtime_sql_lease_takeovers", {
  description: "Runtime SQL ready claims that replaced a prior execution claim",
  incremental: true,
})

const schemaStatuses = Metric.frequency("generalist_runtime_sql_schema_statuses", {
  description: "Runtime SQL schema verification outcomes",
  preregisteredWords: [
    "current",
    "dirty",
    "checksum-mismatch",
    "upgrade-required",
    "version-unsupported",
    "migration-failed",
  ],
})

const failureOutcome = (cause: Cause.Cause<unknown>): SqlTransitionOutcome => {
  const error = Cause.squash(cause)
  if (Schema.is(StaleClaim)(error) || Schema.is(StaleSessionClaim)(error)) return "stale-claim"
  if (
    (Schema.is(RuntimeUnavailable)(error) && error.message.toLowerCase().includes("divergent")) ||
    (Predicate.hasProperty(error, "_tag") && Predicate.isString(error._tag) && error._tag.endsWith("Conflict"))
  )
    return "divergent-retry"
  return "rolled-back"
}

const markSqlTransitionOutcome = (outcome: "exact-retry" | "divergent-retry"): Effect.Effect<void> =>
  currentTransition.pipe(
    Effect.flatMap((observation) =>
      observation.active
        ? Effect.sync(() => {
            observation.outcome = outcome
          })
        : Effect.void,
    ),
  )

export const markSqlTransitionExactRetry: Effect.Effect<void> = markSqlTransitionOutcome("exact-retry")

export const markSqlTransitionDivergentRetry: Effect.Effect<void> = markSqlTransitionOutcome("divergent-retry")

const observeSqlLock = <A, E, R>(
  backend: Exclude<StoreBackend, "memory">,
  lock: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  currentTransition.pipe(
    Effect.flatMap((observation) =>
      effect.pipe(
        Effect.trackDuration(
          Metric.withAttributes(lockWaitDuration, { backend, lock, transition: observation.transition }),
        ),
        Effect.withSpan("Generalist.Runtime.sqlLock", {
          attributes: {
            "generalist.runtime.sql.backend": backend,
            "generalist.runtime.sql.lock": lock,
            "generalist.runtime.sql.transition": observation.transition,
          },
        }),
      ),
    ),
  )

const recordSqlReadyClaimBatch = (
  backend: Exclude<StoreBackend, "memory">,
  batchSize: number,
  takeovers: number,
): Effect.Effect<void> =>
  Metric.update(Metric.withAttributes(readyClaimBatchSize, { backend }), batchSize).pipe(
    Effect.andThen(Metric.update(Metric.withAttributes(leaseTakeovers, { backend }), takeovers)),
    Effect.andThen(
      Effect.annotateCurrentSpan({
        "generalist.runtime.sql.claim.batch_size": batchSize,
        "generalist.runtime.sql.claim.lease_takeovers": takeovers,
      }),
    ),
  )

const observeSqlTransition = <A, E, R>(
  backend: Exclude<StoreBackend, "memory">,
  transition: string,
  attributes: SqlTransitionAttributes,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const observation: TransitionObservation = { active: true, transition, outcome: "committed" }
  const metricAttributes = { backend, transition }
  const spanAttributes = {
    "generalist.runtime.sql.backend": backend,
    "generalist.runtime.sql.transition": transition,
    ...(attributes.runId === undefined ? undefined : { "generalist.runtime.run_id": attributes.runId }),
    ...(attributes.operationId === undefined
      ? undefined
      : { "generalist.runtime.operation_id": attributes.operationId }),
    ...(attributes.operationKind === undefined
      ? undefined
      : { "generalist.runtime.operation_kind": attributes.operationKind }),
  }
  const duration = Metric.withAttributes(transitionDuration, metricAttributes)
  const outcomes = Metric.withAttributes(transitionOutcomes, metricAttributes)

  return Effect.withFiber((fiber) => {
    const prior = transitionsByFiber.get(fiber.id)
    transitionsByFiber.set(fiber.id, observation)
    return effect.pipe(
      Effect.onExit((exit) => {
        let outcome = observation.outcome
        if (Exit.isFailure(exit) && outcome !== "divergent-retry") outcome = failureOutcome(exit.cause)
        return Effect.annotateCurrentSpan({
          "generalist.runtime.sql.outcome": outcome,
          ...(outcome === "exact-retry" || outcome === "divergent-retry"
            ? { "generalist.runtime.sql.retry.classification": outcome }
            : undefined),
        }).pipe(Effect.andThen(Metric.update(outcomes, outcome)))
      }),
      Effect.trackDuration(duration),
      Effect.withSpan("Generalist.Runtime.sqlTransition", { attributes: spanAttributes }),
      Effect.ensuring(
        Effect.sync(() => {
          if (prior === undefined) transitionsByFiber.delete(fiber.id)
          else transitionsByFiber.set(fiber.id, prior)
        }),
      ),
    )
  })
}

type SqlSchemaStatus =
  | "current"
  | "dirty"
  | "checksum-mismatch"
  | "upgrade-required"
  | "version-unsupported"
  | "migration-failed"

const schemaStatus = (exit: Exit.Exit<unknown, unknown>): SqlSchemaStatus => {
  if (Exit.isSuccess(exit)) return "current"
  const error = Cause.squash(exit.cause)
  if (Schema.is(SchemaDirty)(error)) return "dirty"
  if (Schema.is(SchemaChecksumMismatch)(error)) return "checksum-mismatch"
  if (Schema.is(SchemaUpgradeRequired)(error)) return "upgrade-required"
  if (Schema.is(SchemaVersionUnsupported)(error)) return "version-unsupported"
  if (Schema.is(SchemaMigrationFailed)(error)) return "migration-failed"
  return "migration-failed"
}

const observeSqlMigration = <A, E, R>(
  backend: Exclude<StoreBackend, "memory">,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => {
  const checksum = sqlSchemaChecksum()
  const statusMetric = Metric.withAttributes(schemaStatuses, {
    backend,
    version: String(SQL_SCHEMA_VERSION),
    checksum,
  })
  return observeSqlTransition(
    backend,
    "migrate",
    {},
    effect.pipe(
      Effect.onExit((exit) => {
        const status = schemaStatus(exit)
        return Effect.annotateCurrentSpan({
          "generalist.runtime.sql.schema.version": SQL_SCHEMA_VERSION,
          "generalist.runtime.sql.schema.checksum": checksum,
          "generalist.runtime.sql.schema.status": status,
        }).pipe(Effect.andThen(Metric.update(statusMetric, status)))
      }),
    ),
  )
}

const observeRunStore = (backend: Exclude<StoreBackend, "memory">, store: RunStoreService): RunStoreService => {
  const observe = <A, E, R>(transition: string, attributes: SqlTransitionAttributes, effect: Effect.Effect<A, E, R>) =>
    observeSqlTransition(backend, transition, attributes, effect)
  return RunStore.of({
    ...store,
    admitSend: (input) =>
      observe("admitSend", input.runId === undefined ? {} : { runId: input.runId }, store.admitSend(input)),
    admitStart: (input, options) => observe("admitStart", {}, store.admitStart(input, options)),
    activate: (input) => observe("activate", { runId: input.runId }, store.activate(input)),
    admitSpawn: (input) => observe("admitSpawn", { runId: input.parentRunId }, store.admitSpawn(input)),
    admitProgramChild: (input) => observe("admitProgramChild", { runId: input.runId }, store.admitProgramChild(input)),
    admitProgramChildAndSuspend: (input) =>
      observe("admitProgramChildAndSuspend", { runId: input.runId }, store.admitProgramChildAndSuspend(input)),
    respond: (input) => observe("respond", { runId: input.runId }, store.respond(input)),
    respondApproval: (input) => observe("respondApproval", { runId: input.runId }, store.respondApproval(input)),
    signal: (input) => observe("signal", { runId: input.runId }, store.signal(input)),
    cancel: (input) => observe("cancel", { runId: input.runId }, store.cancel(input)),
    cancelSession: (input) => observe("cancelSession", {}, store.cancelSession(input)),
    admitSteering: (input) => observe("admitSteering", { runId: input.runId }, store.admitSteering(input)),
    readSteering: (input) => observe("readSteering", { runId: input.runId }, store.readSteering(input)),
    registerAgentName: (input) => observe("registerAgentName", { runId: input.runId }, store.registerAgentName(input)),
    admitMessage: (input) => observe("admitMessage", {}, store.admitMessage(input)),
    deliverPendingMessages: (input) =>
      observe("deliverPendingMessages", { runId: input.runId }, store.deliverPendingMessages(input)),
    acknowledge: (input) => observe("acknowledge", { runId: input.runId }, store.acknowledge(input)),
    complete: (input) => observe("complete", { runId: input.runId }, store.complete(input)),
    fail: (input) => observe("fail", { runId: input.runId }, store.fail(input)),
    suspend: (input) => observe("suspend", { runId: input.runId }, store.suspend(input)),
    resume: (input) => observe("resume", { runId: input.runId }, store.resume(input)),
    emitAgentEvent: (input) => observe("emitAgentEvent", { runId: input.runId }, store.emitAgentEvent(input)),
    recordOperation: (input) =>
      observe("recordOperation", { runId: input.runId, operationKind: input.kind }, store.recordOperation(input)),
    startOperation: (input) =>
      observe("startOperation", { runId: input.runId, operationId: input.operationId }, store.startOperation(input)),
    completeOperation: (input) =>
      observe(
        "completeOperation",
        { runId: input.runId, operationId: input.operationId },
        store.completeOperation(input),
      ),
    commitModelResponse: (input) =>
      observe(
        "commitModelResponse",
        { runId: input.runId, operationId: input.operationId, operationKind: "model" },
        store.commitModelResponse(input),
      ),
    commitInterruptedModelResponse: (input) =>
      observe(
        "commitInterruptedModelResponse",
        { runId: input.runId, operationId: input.operationId, operationKind: "model" },
        store.commitInterruptedModelResponse(input),
      ),
    expireRunningOperation: (input) =>
      observe(
        "expireRunningOperation",
        { runId: input.runId, operationId: input.operationId },
        store.expireRunningOperation(input),
      ),
    recoverRunningOperations: (input) =>
      observe("recoverRunningOperations", { runId: input.runId }, store.recoverRunningOperations(input)),
    operationCancellations: (input) =>
      observe("operationCancellations", { runId: input.runId }, store.operationCancellations(input)),
    acknowledgeOperationCancellation: (input) =>
      observe(
        "acknowledgeOperationCancellation",
        { runId: input.runId, operationId: input.operationId },
        store.acknowledgeOperationCancellation(input),
      ),
    resolveOperation: (input) =>
      observe(
        "resolveOperation",
        { runId: input.runId, operationId: input.operationId },
        store.resolveOperation(input),
      ),
    claimExecution: (input) => observe("claimExecution", { runId: input.runId }, store.claimExecution(input)),
    releaseExecution: (input) => observe("releaseExecution", { runId: input.runId }, store.releaseExecution(input)),
    saveExecution: (input) => observe("saveExecution", { runId: input.runId }, store.saveExecution(input)),
    retryExecution: (input) => observe("retryExecution", { runId: input.runId }, store.retryExecution(input)),
    admitFanOut: (input) => observe("admitFanOut", { runId: input.parentRunId }, store.admitFanOut(input)),
    reserveProgramOperation: (input) =>
      observe(
        "reserveProgramOperation",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.reserveProgramOperation(input),
      ),
    admitProgramAgents: (input) =>
      observe(
        "admitProgramAgents",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.admitProgramAgents(input),
      ),
    suspendProgramOperation: (input) =>
      observe(
        "suspendProgramOperation",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.suspendProgramOperation(input),
      ),
    settleProgramOperation: (input) =>
      observe(
        "settleProgramOperation",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.settleProgramOperation(input),
      ),
    startProgramOperation: (input) =>
      observe(
        "startProgramOperation",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.startProgramOperation(input),
      ),
    completeProgram: (input) => observe("completeProgram", { runId: input.runId }, store.completeProgram(input)),
    commitProgramLog: (input) =>
      observe(
        "commitProgramLog",
        { runId: input.runId, operationId: input.operation, operationKind: "program" },
        store.commitProgramLog(input),
      ),
  })
}

const observeExternalChildStore = (
  backend: Exclude<StoreBackend, "memory">,
  store: ExternalChildStoreService,
): ExternalChildStoreService => {
  const observe = <A, E, R>(transition: string, effect: Effect.Effect<A, E, R>) =>
    observeSqlTransition(backend, transition, {}, effect)
  return ExternalChildStore.of({
    ...store,
    reserve: (input) => observe("reserveExternalChild", store.reserve(input)),
    acknowledge: (placementId) => observe("acknowledgeExternalChild", store.acknowledge(placementId)),
    settle: (input) => observe("settleExternalChild", store.settle(input)),
    cancel: (placementId) => observe("cancelExternalChild", store.cancel(placementId)),
    admitRoot: (input) => observe("admitExternalRoot", store.admitRoot(input)),
    activateRoot: (placementId) => observe("activateExternalRoot", store.activateRoot(placementId)),
    cancelRoot: (placementId, reason) => observe("cancelExternalRoot", store.cancelRoot(placementId, reason)),
    acknowledgeRootSettlement: (input) =>
      observe("acknowledgeExternalRootSettlement", store.acknowledgeRootSettlement(input)),
  })
}

const observeSqlLocks = (backend: Exclude<StoreBackend, "memory">, locks: SqlStoreLocks): SqlStoreLocks => ({
  run: (runId) => observeSqlLock(backend, "run", locks.run(runId)),
  fence: (runId) => observeSqlLock(backend, "fence", locks.fence(runId)),
  hierarchy: (runId) => observeSqlLock(backend, "hierarchy", locks.hierarchy(runId)),
  spawn: (runId) => observeSqlLock(backend, "spawn", locks.spawn(runId)),
  admission: (input) => observeSqlLock(backend, "admission", locks.admission(input)),
  admissionRegistrations: observeSqlLock(backend, "admission-registrations", locks.admissionRegistrations),
  registrations: observeSqlLock(backend, "registrations", locks.registrations),
  mailbox: (sessionId) => observeSqlLock(backend, "mailbox", locks.mailbox(sessionId)),
  fanOut: (input) => observeSqlLock(backend, "fan-out", locks.fanOut(input)),
})

export const SqlObservability = {
  observeExternalChildStore,
  observeLock: observeSqlLock,
  observeMigration: observeSqlMigration,
  observeRunStore,
  observeTransition: observeSqlTransition,
  observeLocks: observeSqlLocks,
  recordReadyClaimBatch: recordSqlReadyClaimBatch,
} as const
