import { Duration, Effect, Option, Ref, Schedule, Stream, type Scope } from "effect"
import {} from "tenetkit/runtime/driver/sql/store-list"
import { SqlClient } from "effect/unstable/sql"
import {
  admitProgramAgents,
  commitProgramLog,
  getProgramOperation,
  loadProgramState,
  reserveProgramOperation,
  resolveProgramOperation,
  settleProgramOperation,
  startProgramOperation,
  suspendProgramOperation,
} from "tenetkit/runtime/driver/sql/store-program"
import { RunNotFound, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { checkpointRef } from "tenetkit/runtime/driver/executable-manifest"
import type { LayerOptions } from "tenetkit/runtime/driver/runtime"
import { RunStore, type Interface as RunStoreInterface } from "tenetkit/runtime/driver/run-store"
import { admitProgramChild, admitSend, admitSpawn, admitStart } from "tenetkit/runtime/driver/sql/store-admit"
import { activateRoot } from "tenetkit/runtime/driver/sql/store-activate"
import { cancel, complete, emitAgentEvent, fail, respond } from "tenetkit/runtime/driver/sql/store-control"
import { respondApproval, resume, settleAdmittedCancellation, signal } from "tenetkit/runtime/driver/sql/store-control"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  resolveOperation,
} from "tenetkit/runtime/driver/sql/store-operations"
import { recoverRunningOperations } from "tenetkit/runtime/driver/sql/store-operation-recovery"
import {
  claimExecution,
  loadExecution,
  requireExecutionClaim,
  retryExecution,
} from "tenetkit/runtime/driver/sql/store-execution"
import { appendEvent, hasAdmission, loadEventsAfter, loadRun, nowIso } from "tenetkit/runtime/driver/sql/store-helpers"
import { releaseLeasedExecution as releaseExecution } from "tenetkit/runtime/driver/sql/store-release-leased"
import { makeEventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { admitSteering, readSteering, saveCompletionContinuation } from "tenetkit/runtime/driver/sql/store-steering"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  registerAgentName,
  resolveAddress,
} from "tenetkit/runtime/driver/sql/store-directory"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "tenetkit/runtime/driver/sql/errors"
import { check as checkSchema } from "./run-schema.js"
import { inspectionStoreMethods } from "./store-inspection.js"
import { initializeReadCommitted, makeMysqlClaims } from "./store-claims.js"
import { admitFanOut, inspectFanOut } from "tenetkit/runtime/driver/sql/store-fan-out"
import {} from "tenetkit/runtime/driver/sql/tree-history"
import {} from "tenetkit/runtime/driver/sql/inspection"
import { encodeExecutableRef, encodeJson } from "tenetkit/runtime/driver/sql/codecs"
import { encodeContinuation } from "tenetkit/runtime/driver/steering"
import { ProgramCapabilities } from "tenetkit"
import { groupIdFromSuspension, resultFromInspection } from "tenetkit/runtime/driver/child-group"
import { encodeReason, WaitResolution } from "tenetkit/runtime/driver/run-wait"
import { ExecutionCheckpoint, ExecutionSuspension } from "tenetkit/runtime/driver/execution-state"
import { makeTransactionRunner } from "./transaction-events.js"
import { settlementNotifications } from "tenetkit/runtime/driver/sql/settlement-notifications"
import { makeMysqlSessionStore } from "./session-store.js"
import { reconcileCancellationRequested } from "tenetkit/runtime/driver/sql/session-lifecycle"
import { cancelSessionRuns } from "./session-cancellation.js"
import { makeMysqlModelResponseOperations } from "./store-model-response.js"
import { MysqlOperationCommit } from "./operation-commit.js"
import { loadTerminalEvent, reconcileChildWaitWith } from "tenetkit/runtime/driver/sql/store-child-settlement"
import {} from "tenetkit/runtime/driver/sql/store-child-capacity"
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
export const makeMysqlServices = (
  options: MysqlStoreOptions,
): Effect.Effect<
  { readonly store: RunStoreInterface; readonly claims: import("tenetkit/runtime/driver/sql/run-claims").Interface },
  MysqlStoreError,
  SqlClient.SqlClient | Scope.Scope
> =>
  Effect.gen(function* () {
    const source = options.source ?? "mysql"
    const addressBindings = new Map(options.addresses.map((entry) => [entry.address, entry.executable] as const))
    yield* checkSchema(source)
    const hub = yield* makeEventHub
    yield* Effect.addFinalizer(() => hub.shutdown)
    const capacity = options.subscriberQueueCapacity ?? 64
    const sql = yield* SqlClient.SqlClient
    yield* reconcileCancellationRequested.pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
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
    yield* initializeReadCommitted({ sql, connections }).pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
    const isolation = yield* sql<{ isolation: string }>`SELECT @@transaction_isolation AS isolation`.pipe(
      Effect.mapError((error) => SchemaMigrationFailed.make({ source, message: String(error) })),
    )
    if (isolation[0]?.isolation !== "READ-COMMITTED") {
      return yield* SchemaMigrationFailed.make({ source, message: "MySQL runtime requires READ COMMITTED" })
    }
    const { run, runNoTxn, runInspection, transactionHub } = makeTransactionRunner({ sql, hub })
    const lockRun = (runId: string) => sql`SELECT run_id FROM tenetkit_runs WHERE run_id = ${runId} FOR UPDATE`
    const lockParent = (runId: string) =>
      sql<{ parent_run_id: string | null }>`SELECT parent_run_id FROM tenetkit_runs WHERE run_id = ${runId}`.pipe(
        Effect.flatMap((rows) =>
          rows[0]?.parent_run_id === null || rows[0]?.parent_run_id === undefined
            ? Effect.void
            : lockRun(rows[0].parent_run_id).pipe(Effect.asVoid),
        ),
      )
    const clearClaim = (runId: string) =>
      sql`
        UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL
        WHERE run_id = ${runId} AND status IN ('succeeded', 'failed', 'cancelled')
      `.pipe(Effect.asVoid)
    const fenced = <A, E>(
      input: import("tenetkit/runtime/driver/run-store").ExecutionClaim,
      effect: Effect.Effect<A, E, SqlClient.SqlClient>,
    ) => run(lockRun(input.runId).pipe(Effect.andThen(requireExecutionClaim(input)), Effect.andThen(effect)))
    const lockNamed = <A, E>(key: string, effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.gen(function* () {
        const held = yield* sql`SELECT lock_key FROM tenetkit_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
        if (held.length === 0) {
          yield* sql`INSERT IGNORE INTO tenetkit_runtime_locks (lock_key) VALUES (${key})`
          yield* sql`SELECT lock_key FROM tenetkit_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
        }
        return yield* effect
      })
    const suspend = (input: Parameters<RunStoreInterface["suspend"]>[0]) =>
      Effect.gen(function* () {
        const loaded = yield* loadRun(input.runId)
        if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
        const opened = yield* nowIso
        const executableRef = yield* Effect.try({
          try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, input.checkpoint),
          catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
        })
        yield* sql`
          UPDATE tenetkit_runs SET
            driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
            executable_ref_json = ${encodeExecutableRef(executableRef)},
            suspension_json = ${encodeJson(ExecutionSuspension, input.suspension)},
            continuation_json = CASE WHEN ${input.continuation === undefined ? 0 : 1} = 1
              THEN ${input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)}
              ELSE continuation_json END,
            updated_at = ${opened}
          WHERE run_id = ${input.runId}
        `
        yield* sql`
          INSERT INTO tenetkit_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
          VALUES (${loaded.runId}, ${input.wait.waitId}, ${encodeReason(input.wait.reason)}, 'open', NULL, ${opened}, NULL)
          ON DUPLICATE KEY UPDATE reason = VALUES(reason), status = 'open', response_json = NULL,
            opened_at = VALUES(opened_at), closed_at = NULL
        `
        yield* appendEvent(
          transactionHub,
          loaded,
          { _tag: "RunWaiting", wait: { ...input.wait, openedAt: opened } },
          "waiting",
        )
        const child = typeof input.suspension.token === "string" ? yield* loadRun(input.suspension.token) : undefined
        const terminalEvent =
          child?.terminalEventId === undefined ? undefined : yield* loadTerminalEvent(child.terminalEventId)
        if (child !== undefined && terminalEvent !== undefined) {
          yield* reconcileChildWaitWith({
            hub: transactionHub,
            parent: (yield* loadRun(loaded.runId))!,
            child,
            event: terminalEvent,
            append: appendEvent,
          })
        }
        const groupId = groupIdFromSuspension(input.suspension)
        if (groupId !== undefined) {
          const rows = yield* sql<{ parent_run_id: string; status: string }>`
            SELECT parent_run_id, status FROM tenetkit_fan_outs WHERE fan_out_id = ${groupId}
          `
          const group = rows[0]
          if (group?.parent_run_id === loaded.runId && group.status !== "running") {
            const resolution = {
              _tag: "Signal" as const,
              name: input.wait.waitId,
              payload: resultFromInspection(
                yield* inspectFanOut(groupId).pipe(
                  Effect.mapError(() => RuntimeUnavailable.make({ message: `child group ${groupId} disappeared` })),
                ),
              ),
            }
            const closed = yield* nowIso
            yield* sql`
              UPDATE tenetkit_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closed}
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.wait.waitId} AND status = 'open'
            `
            yield* appendEvent(
              transactionHub,
              (yield* loadRun(loaded.runId))!,
              { _tag: "RunResumed", waitId: input.wait.waitId, resolution },
              "running",
            )
          }
        }
        yield* sql`
          UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${loaded.runId}
        `
      })
    const saveExecution = (input: Parameters<RunStoreInterface["saveExecution"]>[0]) =>
      Effect.gen(function* () {
        yield* requireExecutionClaim(input)
        const loaded = yield* loadRun(input.runId)
        if (loaded === undefined) return yield* RunNotFound.make({ runId: input.runId })
        const executableRef = yield* Effect.try({
          try: () => checkpointRef(loaded.executableRef, loaded.executableManifest, input.checkpoint),
          catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
        })
        yield* sql`
          UPDATE tenetkit_runs SET
            driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
            executable_ref_json = ${encodeExecutableRef(executableRef)},
            suspension_json = COALESCE(${input.suspension === undefined ? null : encodeJson(ExecutionSuspension, input.suspension)}, suspension_json),
            updated_at = ${yield* nowIso}
          WHERE run_id = ${input.runId} AND owner_worker_id = ${input.ownerId} AND attempt_fence = ${input.attemptFence}
        `
      })
    const modelResponseOperations = makeMysqlModelResponseOperations({ sql, hub: transactionHub, run })
    const store = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "mysql", multiWorker: true }),
      sessionStore: (sessionId) => Effect.succeed(Option.some(makeMysqlSessionStore({ sessionId, run, runNoTxn }))),
      hasAdmission: (input) => runNoTxn(hasAdmission(input)),
      admitSend: (input) =>
        run(
          lockNamed(
            `tenetkit:admit:${input.message.to}:${input.message.sessionId}`,
            admitSend(transactionHub, addressBindings, input, { promote: false }),
          ),
        ),
      admitStart: (input, startOptions) =>
        run(lockNamed("tenetkit:executable-registrations", admitStart(transactionHub, input, startOptions))),
      activate: (input) => run(lockRun(input.runId).pipe(Effect.andThen(activateRoot(transactionHub, input.runId)))),
      admitSpawn: (input) => run(lockRun(input.parentRunId).pipe(Effect.andThen(admitSpawn(transactionHub, input)))),
      admitProgramChild: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(requireExecutionClaim(input)),
            Effect.andThen(admitProgramChild(transactionHub, input)),
          ),
        ),
      admitProgramChildAndSuspend: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(requireExecutionClaim(input)),
            Effect.andThen(admitProgramChild(transactionHub, input)),
            Effect.tap(() => suspend(input)),
          ),
        ),
      events: (input) =>
        Stream.unwrap(
          Effect.gen(function* () {
            const pollCursor = yield* Ref.make(input.cursor)
            const deliveredCursor = yield* Ref.make(input.cursor)
            const poll = Ref.get(pollCursor).pipe(
              Effect.flatMap((after) => runNoTxn(loadEventsAfter(input.runId, after))),
              Effect.flatMap((events) =>
                Effect.forEach(
                  events,
                  (event) => hub.publish(input.runId, event).pipe(Effect.andThen(Ref.set(pollCursor, event.sequence))),
                  { discard: true },
                ),
              ),
              Effect.ignore,
              Effect.repeat(Schedule.spaced(options.pollInterval ?? "50 millis")),
              Effect.asVoid,
            )
            return hub
              .subscribe({
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
              .pipe(
                Stream.filterEffect((event) =>
                  Ref.modify(deliveredCursor, (cursor) => [event.sequence > cursor, Math.max(cursor, event.sequence)]),
                ),
              )
          }),
        ),
      respond: (input) => run(lockRun(input.runId).pipe(Effect.andThen(respond(transactionHub, input)))),
      respondApproval: (input) =>
        run(lockRun(input.runId).pipe(Effect.andThen(respondApproval(transactionHub, input)))),
      signal: (input) => run(lockRun(input.runId).pipe(Effect.andThen(signal(transactionHub, input)))),
      cancel: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(lockParent(input.runId)),
            Effect.andThen(cancel(transactionHub, input)),
            Effect.andThen(clearClaim(input.runId)),
          ),
        ),
      cancelSession: (input) =>
        run(cancelSessionRuns({ hub: transactionHub, lockRun, lockParent, clearClaim, ...input })),
      admitSteering: (input) => run(lockRun(input.runId).pipe(Effect.andThen(admitSteering(transactionHub, input)))),
      readSteering: (input) => fenced(input, readSteering(input)),
      directory: (runId) => runNoTxn(directory(runId)),
      resolveAddress: (address) => runNoTxn(resolveAddress(address)),
      registerAgentName: (input) => run(lockRun(input.runId).pipe(Effect.andThen(registerAgentName(input)))),
      listRelated: (runId) => runNoTxn(listRelated(runId)),
      admitMessage: (input) => run(lockNamed(`tenetkit:mailbox:${input.targetSessionId}`, admitMessage(input))),
      pendingMessages: (input) => runNoTxn(pendingMessages(input)),
      settlementNotifications: (input) => runNoTxn(settlementNotifications(input)),
      deliverPendingMessages: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(directory(input.runId)),
            Effect.flatMap((entry) =>
              lockNamed(`tenetkit:mailbox:${entry.sessionId}`, deliverPendingMessages(transactionHub, input)),
            ),
          ),
        ),
      ...inspectionStoreMethods({ hub, runNoTxn, runInspection }),
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
      suspend: (input) => fenced(input, suspend(input)),
      resume: (input) => run(lockRun(input.runId).pipe(Effect.andThen(resume(transactionHub, input)))),
      emitAgentEvent: (input) => fenced(input, emitAgentEvent(transactionHub, input)),
      recordOperation: (input) => fenced(input, recordOperation(transactionHub, input)),
      startOperation: (input) => fenced(input, startOperation(input)),
      completeOperation: (input) => fenced(input, MysqlOperationCommit.complete(transactionHub, input)),
      ...modelResponseOperations,
      expireRunningOperation: (input) => fenced(input, expireRunningOperation(transactionHub, input)),
      recoverRunningOperations: (input) => fenced(input, recoverRunningOperations(transactionHub, input)),
      getOperation: (input) => runNoTxn(getOperation(input)),
      getOperationByKey: (input) => runNoTxn(getOperationByKey(input)),
      resolveOperation: (input) =>
        run(
          lockRun(input.runId).pipe(
            Effect.andThen(getProgramOperation({ runId: input.runId, operation: input.operationId })),
            Effect.flatMap((program) =>
              program === undefined
                ? resolveOperation(input, "queued", true)
                : resolveProgramOperation(input, "queued", true),
            ),
            Effect.andThen(settleAdmittedCancellation(transactionHub, input.runId)),
          ),
        ),
      claimExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(claimExecution(transactionHub, input)))),
      loadExecution: (runId) => runNoTxn(loadExecution(runId)),
      releaseExecution: (input) => run(releaseExecution(input)),
      saveExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(saveExecution(input)))),
      retryExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(retryExecution(transactionHub, input)))),
      admitFanOut: (input) =>
        run(
          lockNamed(
            `tenetkit:fanout:${input.parentRunId}`,
            lockRun(input.parentRunId).pipe(Effect.andThen(admitFanOut(transactionHub, input))),
          ),
        ),
      inspectFanOut: (fanOutId) => runNoTxn(inspectFanOut(fanOutId)),
      reserveProgramOperation: (input) => fenced(input, reserveProgramOperation(input)),
      admitProgramAgents: (input) =>
        fenced(
          input,
          admitProgramAgents(transactionHub, input, (_hub, operation) => suspend(operation)),
        ),
      suspendProgramOperation: (input) =>
        fenced(
          input,
          suspendProgramOperation(transactionHub, input, (_hub, operation) => suspend(operation)),
        ),
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
        fenced(
          input,
          Effect.gen(function* () {
            if (input.outputBytes > input.outputLimit)
              return yield* ProgramCapabilities.ProgramBudgetExhausted.make({
                dimension: "outputBytes",
                limit: input.outputLimit,
              })
            yield* lockParent(input.runId)
            yield* complete(transactionHub, {
              ...input,
              result: { _tag: "Program", value: input.output },
            })
            yield* clearClaim(input.runId)
            return { _tag: "Completed" as const }
          }),
        ),
      commitProgramLog: (input) => fenced(input, commitProgramLog(transactionHub, input)),
    })
    return { store, claims: makeMysqlClaims({ sql, hub: transactionHub, run, lockParent, clearClaim }) }
  })
