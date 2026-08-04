import { Effect, Equal, Stream } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { PgClient } from "@effect/sql-pg"
import {
  AddressNotFound,
  CursorExpired,
  AgentVersionUnavailable,
  IdempotencyConflict,
  RunIdConflict,
  ResponseConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  WaitNotOpen,
} from "../../errors.js"
import { messageDigest } from "../../memory/digest.js"
import { agentKey } from "../../memory/state.js"
import type { LayerOptions } from "../../runtime.js"
import { isTerminal } from "../../run.js"
import { RunStore } from "../../run-store.js"
import { admitSteering, readSteering, saveCompletionContinuation } from "../store-steering.js"
import type { RunRow } from "../rows.js"
import { withSql } from "../sql-effect.js"
import { makeEventHub } from "../subscribers.js"
import { check as checkSchema } from "./run-schema.js"
import { NOTIFY_CHANNEL } from "./schema.js"
import { makePostgresClaims } from "./store-claims.js"
import { postgresOperations } from "./store-ops.js"
import { claimExecution, loadExecution, requireExecutionClaim, saveExecution } from "../store-execution.js"
import { decodeRun, loadRunWait } from "../store-helpers.js"
import type { WaitResolution } from "../../run-wait.js"
import { fanOutStoreMethods } from "./store-fan-out.js"
import { deferCancelledFanOutParent, makeCancelRun } from "./store-cancel.js"
import { loadTreeHistory } from "../tree-history.js"
import {
  afterTerminal,
  appendEvent,
  emitAgentEvent,
  enqueueLane,
  insertRun,
  loadEventsAfter,
  loadRun,
  settleParent,
} from "./pg-helpers.js"
export interface PostgresStoreOptions extends LayerOptions {
  readonly url: string
  readonly source?: string
}
const nextId = (prefix: string) => Effect.sync(() => `${prefix}_${Math.random().toString(36).slice(2)}`)
export const makePostgresServices = (options: PostgresStoreOptions) =>
  Effect.gen(function* () {
    const source = options.source ?? "postgres"
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
    const pg = yield* PgClient.PgClient
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | PgClient.PgClient>) =>
      withSql(sql, sql.withTransaction(effect.pipe(Effect.provideService(PgClient.PgClient, pg))))
    const runNoTxn = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient | PgClient.PgClient>) =>
      withSql(sql, effect.pipe(Effect.provideService(PgClient.PgClient, pg)))
    const requireRun = (runId: string) =>
      loadRun(runId).pipe(
        Effect.flatMap((loaded) =>
          loaded === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(loaded),
        ),
      )
    const cancelRun = makeCancelRun({ sql, hub: transactionHub })
    const operations = postgresOperations({
      sql,
      hub: transactionHub,
      run,
      runNoTxn,
      requireRun,
      requireClaim: requireExecutionClaim,
      nextId,
    })
    const store = RunStore.of({
      info: Effect.succeed({ durability: "durable", backend: "postgres", multiWorker: true }),
      admitSend: (input) =>
        run(
          Effect.gen(function* () {
            const bound = addressBindings.get(input.message.to)
            if (bound === undefined) return yield* AddressNotFound.make({ address: input.message.to })
            if (
              bound.id !== input.agent.id ||
              bound.version !== input.agent.version ||
              bound.digest !== input.agent.digest
            ) {
              return yield* AddressNotFound.make({ address: input.message.to })
            }
            if (!agentRefs.has(agentKey(input.agent))) {
              return yield* RuntimeUnavailable.make({ message: "agent not registered" })
            }
            yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`admit:${input.message.to}:${input.message.sessionId}:${input.message.idempotencyKey}`}))`
            if (input.runId !== undefined) {
              yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`run:${input.runId}`}))`
            }
            const digest = messageDigest(input.message)
            const existing = yield* sql<RunRow>`
              SELECT * FROM baton_runs
              WHERE address = ${input.message.to}
                AND session_id = ${input.message.sessionId}
                AND idempotency_key = ${input.message.idempotencyKey}
            `
            const prior = existing[0]
            if (prior !== undefined) {
              if (input.runId !== undefined && input.runId !== prior.run_id) {
                return yield* RunIdConflict.make({ runId: input.runId, existingRunId: prior.run_id })
              }
              if (prior.message_digest !== digest) {
                return yield* IdempotencyConflict.make({
                  address: input.message.to,
                  sessionId: input.message.sessionId,
                  idempotencyKey: input.message.idempotencyKey,
                  existingRunId: prior.run_id,
                })
              }
              return {
                runId: prior.run_id,
                messageId: prior.message_id,
                acceptedSequence: Number(prior.accepted_sequence),
                duplicate: true,
              }
            }
            if (input.runId !== undefined) {
              const byId = yield* sql<RunRow>`SELECT * FROM baton_runs WHERE run_id = ${input.runId}`
              if (byId[0] !== undefined)
                return yield* RunIdConflict.make({ runId: input.runId, existingRunId: byId[0].run_id })
            }
            const runId = input.runId ?? (yield* nextId("run"))
            const enqueued = yield* enqueueLane(input.message.to, input.message.sessionId, runId)
            yield* insertRun({
              runId,
              status: "queued",
              message: input.message,
              digest,
              agent: input.agent,
              rootRunId: runId,
              acceptedSequence: enqueued.acceptedSequence,
            })
            const loaded = (yield* loadRun(runId))!
            yield* appendEvent(
              hub,
              loaded,
              { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
              "queued",
            )
            return {
              runId,
              messageId: input.message.id,
              acceptedSequence: enqueued.acceptedSequence,
              duplicate: false,
            }
          }),
        ),
      admitSpawn: (input) =>
        run(
          Effect.gen(function* () {
            const parent = yield* requireRun(input.parentRunId)
            if (!agentRefs.has(agentKey(input.agent))) {
              return yield* AgentVersionUnavailable.make({ agent: input.agent })
            }
            const digest = messageDigest(input.message)
            const existing = yield* sql<RunRow>`
              SELECT * FROM baton_runs
              WHERE address = ${input.message.to}
                AND session_id = ${input.message.sessionId}
                AND idempotency_key = ${input.message.idempotencyKey}
            `
            const prior = existing[0]
            if (prior !== undefined) {
              if (prior.message_digest !== digest) {
                return yield* IdempotencyConflict.make({
                  address: input.message.to,
                  sessionId: input.message.sessionId,
                  idempotencyKey: input.message.idempotencyKey,
                  existingRunId: prior.run_id,
                })
              }
              return {
                runId: prior.run_id,
                messageId: prior.message_id,
                acceptedSequence: Number(prior.accepted_sequence),
                duplicate: true,
              }
            }
            const runId = yield* nextId("run")
            yield* insertRun({
              runId,
              status: "queued",
              message: input.message,
              digest,
              agent: input.agent,
              rootRunId: parent.rootRunId,
              parentRunId: parent.runId,
              invocationId: input.invocationId,
              acceptedSequence: 0,
            })
            yield* sql`
              INSERT INTO baton_run_links (parent_run_id, child_run_id, invocation_id, terminal_event_id, created_at, settled_at)
              VALUES (${parent.runId}, ${runId}, ${input.invocationId}, NULL, NOW(), NULL)
            `
            yield* appendEvent(hub, parent, {
              _tag: "ChildLinked",
              childRunId: runId,
              invocationId: input.invocationId,
            })
            const child = (yield* loadRun(runId))!
            yield* appendEvent(
              hub,
              child,
              { _tag: "RunAccepted", messageId: input.message.id, address: input.message.to },
              "queued",
            )
            const started = (yield* loadRun(runId))!
            yield* sql`UPDATE baton_runs SET attempt_fence = 1, attempt = 1, status = 'running' WHERE run_id = ${runId}`
            yield* appendEvent(
              transactionHub,
              { ...started, attempt: 1 },
              { _tag: "RunAttemptStarted", attempt: 1 },
              "running",
            )
            return { runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
          }),
        ),
      events: (input) =>
        hub.subscribe({
          runId: input.runId,
          cursor: input.cursor,
          loadReplay: runNoTxn(
            Effect.gen(function* () {
              const loaded = yield* requireRun(input.runId)
              const replay = yield* loadEventsAfter(input.runId, input.cursor)
              return { replay, lastSequence: loaded.lastSequence }
            }),
          ),
          capacity,
          onSubscribed: pg.listen(NOTIFY_CHANNEL).pipe(
            Stream.runForEach((payload) => {
              if (payload !== input.runId) return Effect.void
              return runNoTxn(
                Effect.gen(function* () {
                  const latest = yield* requireRun(input.runId)
                  const events = yield* loadEventsAfter(input.runId, Math.max(input.cursor, latest.lastSequence - 8))
                  yield* Effect.forEach(events, (event) => hub.publish(input.runId, event), { discard: true })
                }),
              ).pipe(Effect.ignore)
            }),
            Effect.ignore,
          ),
        }),
      respond: (input) =>
        run(
          Effect.gen(function* () {
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status))
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            if (loaded.respondedWaitIds.has(input.waitId)) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            if (loaded.activeWaitId !== input.waitId) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            const responded = [...loaded.respondedWaitIds, input.waitId]
            const resolution: WaitResolution = input.resolution
            const closed = yield* sql<{ wait_id: string }>`
              UPDATE baton_run_waits SET status = 'responded', response_json = ${JSON.stringify(resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${input.waitId} AND status = 'open'
              RETURNING wait_id
            `
            if (closed.length === 0) {
              const prior = yield* loadRunWait(loaded.runId, input.waitId)
              if (prior?.resolution !== undefined && Equal.equals(prior.resolution, resolution)) return
              return yield* ResponseConflict.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* sql`
              UPDATE baton_runs
              SET responded_wait_ids_json = ${JSON.stringify(responded)}, updated_at = NOW()
              WHERE run_id = ${loaded.runId}
            `
            const current = (yield* loadRun(loaded.runId))!
            yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
          }),
        ),
      signal: (input) =>
        run(
          Effect.gen(function* () {
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.activeWaitId === undefined || loaded.activeWaitId !== input.name) return
            const resolution: WaitResolution = {
              _tag: "Signal",
              name: input.name,
              ...(input.payload === undefined ? {} : { payload: input.payload }),
            }
            yield* sql`
              UPDATE baton_run_waits SET status = 'signaled', response_json = ${JSON.stringify(resolution)}, closed_at = NOW()
              WHERE run_id = ${loaded.runId} AND wait_id = ${loaded.activeWaitId} AND status = 'open'
            `
            yield* appendEvent(hub, loaded, { _tag: "RunResumed", waitId: loaded.activeWaitId, resolution }, "running")
          }),
        ),
      cancel: (input) =>
        run(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`steering:${input.runId}`}))`.pipe(
            Effect.andThen(cancelRun(input.runId, input.reason)),
          ),
        ),
      admitSteering: (input) =>
        run(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`steering:${input.runId}`}))`.pipe(
            Effect.andThen(admitSteering(input)),
          ),
        ),
      readSteering: (input) => run(requireExecutionClaim(input).pipe(Effect.andThen(readSteering(input)))),
      inspect: (runId) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* requireRun(runId)
            const wait = yield* loadRunWait(runId, loaded.activeWaitId)
            return {
              runId: loaded.runId,
              status: loaded.status,
              agent: loaded.agent,
              lastSequence: loaded.lastSequence,
              durability: "durable" as const,
              ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
              ...(wait === undefined ? {} : { wait }),
            }
          }),
        ),
      history: (input) =>
        runNoTxn(
          Effect.gen(function* () {
            const loaded = yield* requireRun(input.runId)
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
                ? yield* sql<RunRow>`SELECT * FROM baton_runs ORDER BY created_at DESC LIMIT ${input.limit}`
                : yield* sql<RunRow>`SELECT * FROM baton_runs WHERE status = ${input.status} ORDER BY created_at DESC LIMIT ${input.limit}`
            return yield* Effect.forEach(rows, (row) =>
              Effect.gen(function* () {
                const loaded = decodeRun(row)
                const wait = yield* loadRunWait(loaded.runId, loaded.activeWaitId)
                return {
                  runId: loaded.runId,
                  status: loaded.status,
                  agent: loaded.agent,
                  lastSequence: loaded.lastSequence,
                  durability: "durable" as const,
                  ...(loaded.parentRunId === undefined ? {} : { parentRunId: loaded.parentRunId }),
                  ...(wait === undefined ? {} : { wait }),
                }
              }),
            )
          }),
        ),
      complete: (input) =>
        run(
          Effect.gen(function* () {
            yield* sql`SELECT pg_advisory_xact_lock(hashtext(${`steering:${input.runId}`}))`
            yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${input.runId} FOR UPDATE`
            yield* requireExecutionClaim(input)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.cancellationRequested) {
              if (yield* deferCancelledFanOutParent(sql, loaded.runId)) return { _tag: "Completed" as const }
              const event = yield* appendEvent(
                transactionHub,
                loaded,
                { _tag: "RunCancelled", ...(loaded.cancelReason === undefined ? {} : { reason: loaded.cancelReason }) },
                "cancelled",
              )
              const settled = (yield* loadRun(loaded.runId))!
              yield* settleParent(transactionHub, settled, event.eventId)
              yield* afterTerminal(transactionHub, settled)
              return { _tag: "Completed" as const }
            }
            const continuation = yield* saveCompletionContinuation(input.runId, input.result)
            if (continuation !== undefined) return { _tag: "SteeringPending" as const, continuation }
            const event = yield* appendEvent(
              transactionHub,
              loaded,
              { _tag: "RunCompleted", result: input.result },
              "succeeded",
            )
            const settled = (yield* loadRun(loaded.runId))!
            yield* settleParent(transactionHub, settled, event.eventId)
            yield* afterTerminal(transactionHub, settled)
            return { _tag: "Completed" as const }
          }),
        ),
      fail: (input) =>
        run(
          Effect.gen(function* () {
            yield* sql`SELECT run_id FROM baton_runs WHERE run_id = ${input.runId} FOR UPDATE`
            yield* requireExecutionClaim(input)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.cancellationRequested) {
              if (yield* deferCancelledFanOutParent(sql, loaded.runId)) return
              const event = yield* appendEvent(
                transactionHub,
                loaded,
                { _tag: "RunCancelled", ...(loaded.cancelReason === undefined ? {} : { reason: loaded.cancelReason }) },
                "cancelled",
              )
              const settled = (yield* loadRun(loaded.runId))!
              yield* settleParent(transactionHub, settled, event.eventId)
              yield* afterTerminal(transactionHub, settled)
              return
            }
            const event = yield* appendEvent(
              transactionHub,
              loaded,
              { _tag: "RunFailed", error: input.error },
              "failed",
            )
            const settled = (yield* loadRun(loaded.runId))!
            yield* settleParent(transactionHub, settled, event.eventId)
            yield* afterTerminal(transactionHub, settled)
          }),
        ),
      wait: (input) =>
        run(
          Effect.gen(function* () {
            yield* requireExecutionClaim(input)
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            yield* sql`
              INSERT INTO baton_run_waits (
                run_id, wait_id, reason, status, response_json, due_at, owner_worker_id, lease_expires_at, opened_at, closed_at
              ) VALUES (
                ${loaded.runId}, ${input.wait.waitId}, ${input.wait.reason}, 'open', NULL, NULL, NULL, NULL, NOW(), NULL
              )
              ON CONFLICT (run_id, wait_id) DO UPDATE SET
                status = 'open', reason = EXCLUDED.reason, response_json = NULL, opened_at = EXCLUDED.opened_at, closed_at = NULL
            `
            yield* appendEvent(hub, loaded, { _tag: "RunWaiting", wait: input.wait }, "waiting")
          }),
        ),
      resume: (input) =>
        run(
          Effect.gen(function* () {
            const loaded = yield* requireRun(input.runId)
            if (isTerminal(loaded.status)) {
              return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
            }
            if (loaded.activeWaitId !== input.waitId) {
              return yield* WaitNotOpen.make({ runId: loaded.runId, waitId: input.waitId })
            }
            yield* appendEvent(hub, loaded, { _tag: "RunResumed", waitId: input.waitId }, "running")
          }),
        ),
      emitAgentEvent: (input) => run(emitAgentEvent(transactionHub, input)),
      claimExecution: (input) => run(claimExecution(input)),
      loadExecution: (runId) => run(loadExecution(runId)),
      saveExecution: (input) => run(saveExecution(input)),
      ...fanOutStoreMethods({ sql, pg, hub: transactionHub, run, runNoTxn }),
      ...operations,
    })
    const claims = makePostgresClaims({ sql, hub: transactionHub, run, cancelRun })
    return { store, claims }
  })
