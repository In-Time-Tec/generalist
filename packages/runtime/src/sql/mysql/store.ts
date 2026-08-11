import { Duration, Effect, Option, Ref, Schedule, Stream, type Scope } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { CursorExpired, RunNotFound, RuntimeUnavailable } from "../../errors.js"
import { checkpointRef } from "../../executable-manifest.js"
import type { LayerOptions } from "../../runtime.js"
import { RunStore, type Interface as RunStoreInterface } from "../../run-store.js"
import { admitProgramChild, admitSend, admitSpawn, admitStart } from "../store-admit.js"
import { cancel, complete, emitAgentEvent, fail, respond } from "../store-control.js"
import { respondApproval, resume, settleAdmittedCancellation, signal } from "../store-control.js"
import { cancelSession } from "../store-session.js"
import {
  expireRunningOperation,
  getOperation,
  getOperationByKey,
  recordOperation,
  startOperation,
  resolveOperation,
} from "../store-operations.js"
import { claimExecution, loadExecution, requireExecutionClaim, retryExecution } from "../store-execution.js"
import {
  appendEvent,
  decodeRunEffect,
  hasAdmission,
  loadEventsAfter,
  loadRun,
  loadRunWait,
  nowIso,
} from "../store-helpers.js"
import type { RunRow } from "../rows.js"
import { makeEventHub } from "../subscribers.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "../store-steering.js"
import {
  admitMessage,
  deliverPendingMessages,
  directory,
  listRelated,
  pendingMessages,
  registerAgentName,
  resolveAddress,
} from "../store-directory.js"
import {
  SchemaChecksumMismatch,
  SchemaDirty,
  SchemaMigrationFailed,
  SchemaUpgradeRequired,
  SchemaVersionUnsupported,
} from "../errors.js"
import { check as checkSchema } from "./run-schema.js"
import { initializeReadCommitted, makeMysqlClaims } from "./store-claims.js"
import { admitFanOut, inspectFanOut } from "../store-fan-out.js"
import { loadTreeHistory } from "../tree-history.js"
import { loadRunSnapshot, loadTreeInspection } from "../inspection.js"
import { encodeExecutableRef, encodeJson } from "../codecs.js"
import { encodeContinuation } from "../../steering.js"
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
} from "../store-program.js"
import { ProgramCapabilities } from "@batonfx/core"
import { groupIdFromSuspension, resultFromInspection } from "../../child-group.js"
import { encodeReason, WaitResolution } from "../../run-wait.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../execution-state.js"
import { makeTransactionRunner } from "./transaction-events.js"
import { settlementNotifications } from "../settlement-notifications.js"
import { makeMysqlSessionStore } from "./session-store.js"
import { reconcileCancellationRequested, sessionRoots } from "../session-lifecycle.js"
import { makeMysqlModelResponseOperations } from "./store-model-response.js"
import { MysqlOperationCommit } from "./operation-commit.js"
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
  { readonly store: RunStoreInterface; readonly claims: import("../run-claims.js").Interface },
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
      Effect.gen(function* () {
        const held = yield* sql`SELECT lock_key FROM baton_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
        if (held.length === 0) {
          yield* sql`INSERT IGNORE INTO baton_runtime_locks (lock_key) VALUES (${key})`
          yield* sql`SELECT lock_key FROM baton_runtime_locks WHERE lock_key = ${key} FOR UPDATE`
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
          UPDATE baton_runs SET
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
          INSERT INTO baton_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
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
        const groupId = groupIdFromSuspension(input.suspension)
        if (groupId !== undefined) {
          const rows = yield* sql<{ parent_run_id: string; status: string }>`
            SELECT parent_run_id, status FROM baton_fan_outs WHERE fan_out_id = ${groupId}
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
              UPDATE baton_run_waits SET status = 'signaled', response_json = ${encodeJson(WaitResolution, resolution)}, closed_at = ${closed}
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
          UPDATE baton_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${loaded.runId}
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
          UPDATE baton_runs SET
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
            `baton:admit:${input.message.to}:${input.message.sessionId}`,
            admitSend(transactionHub, addressBindings, input, { promote: false }),
          ),
        ),
      admitStart: (input) => run(lockNamed("baton:executable-registrations", admitStart(transactionHub, input))),
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
      cancelSession: (input) => run(cancelSession(transactionHub, input)),
      admitSteering: (input) => run(lockRun(input.runId).pipe(Effect.andThen(admitSteering(input)))),
      readSteering: (input) => fenced(input, readSteering(input)),
      directory: (runId) => runNoTxn(directory(runId)),
      resolveAddress: (address) => runNoTxn(resolveAddress(address)),
      registerAgentName: (input) => run(lockRun(input.runId).pipe(Effect.andThen(registerAgentName(input)))),
      listRelated: (runId) => runNoTxn(listRelated(runId)),
      admitMessage: (input) => run(lockNamed(`baton:mailbox:${input.targetSessionId}`, admitMessage(input))),
      pendingMessages: (input) => runNoTxn(pendingMessages(input)),
      settlementNotifications: (input) => runNoTxn(settlementNotifications(input)),
      deliverPendingMessages: (input) => run(lockRun(input.runId).pipe(Effect.andThen(deliverPendingMessages(input)))),
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
      snapshot: (runId) => runInspection(loadRunSnapshot(runId)),
      sessionRoots: (sessionId) => runNoTxn(sessionRoots(sessionId)),
      inspectTree: (rootRunId) => runInspection(loadTreeInspection(rootRunId)),
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
      treeChanges: (rootRunId) => hub.subscribeTree({ rootRunId }),
      list: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const limit = sql.literal(String(Math.max(0, Math.floor(input.limit))))
            const rows =
              input.status === undefined
                ? yield* sql<RunRow>`SELECT * FROM baton_runs ORDER BY created_at DESC LIMIT ${limit}`
                : yield* sql<RunRow>`SELECT * FROM baton_runs WHERE status = ${input.status} ORDER BY created_at DESC LIMIT ${limit}`
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
      saveExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(saveExecution(input)))),
      retryExecution: (input) => run(lockRun(input.runId).pipe(Effect.andThen(retryExecution(transactionHub, input)))),
      admitFanOut: (input) =>
        run(
          lockNamed(
            `baton:fanout:${input.parentRunId}`,
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
