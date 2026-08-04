import { Effect, Equal } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { ResponseConflict, RunNotFound, RunTerminal, WaitNotOpen } from "../errors.js"
import type { AgentLoopEvent, AgentResult } from "../agent-event.js"
import type { CancelInput, RespondInput, SignalInput } from "../runtime.js"
import { isTerminal } from "../run.js"
import type { RunFailure } from "../run-event.js"
import type { RunWait, WaitResolution } from "../run-wait.js"
import { afterTerminal, appendEvent, loadRun, loadRunWait, nowIso, settleParent } from "./store-helpers.js"
import type { EventHub } from "./subscribers.js"
import type { DecodedRun } from "./rows.js"

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

const cancelRun = (hub: EventHub, run: DecodedRun, reason: string | undefined) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let current = run
    if (!current.cancellationRequested) {
      yield* appendEvent(
        hub,
        current,
        { _tag: "RunCancellationRequested", ...(reason === undefined ? {} : { reason }) },
        "cancelling",
      )
      current = (yield* loadRun(run.runId))!
    }
    if (isTerminal(current.status)) return
    const event = yield* appendEvent(
      hub,
      current,
      { _tag: "RunCancelled", ...(reason === undefined ? {} : { reason }) },
      "cancelled",
    )
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
    yield* sql`
      UPDATE baton_run_waits SET status = 'cancelled', closed_at = ${yield* nowIso}
      WHERE run_id = ${run.runId} AND status = 'open'
    `
  })

export const respond = (hub: EventHub, input: RespondInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.respondedWaitIds.has(input.waitId)) {
      const prior = yield* loadRunWait(run.runId, input.waitId)
      if (prior?.resolution !== undefined && Equal.equals(prior.resolution, input.resolution)) return
      return yield* ResponseConflict.make({ runId: run.runId, waitId: input.waitId })
    }
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    const responded = [...run.respondedWaitIds, input.waitId]
    const updated = yield* nowIso
    const resolution: WaitResolution = input.resolution
    yield* sql`
      UPDATE baton_run_waits SET status = 'responded', response_json = ${JSON.stringify(resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${input.waitId} AND status = 'open'
    `
    yield* sql`
      UPDATE baton_runs SET responded_wait_ids_json = ${JSON.stringify(responded)}, updated_at = ${updated}
      WHERE run_id = ${run.runId}
    `
    const current = (yield* loadRun(run.runId))!
    yield* appendEvent(hub, current, { _tag: "RunResumed", waitId: input.waitId, resolution }, "running")
  })

export const signal = (hub: EventHub, input: SignalInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.activeWaitId === undefined) return
    if (run.activeWaitId !== input.name) return
    const updated = yield* nowIso
    const resolution: WaitResolution = {
      _tag: "Signal",
      name: input.name,
      ...(input.payload === undefined ? {} : { payload: input.payload }),
    }
    yield* sql`
      UPDATE baton_run_waits SET status = 'signaled', response_json = ${JSON.stringify(resolution)}, closed_at = ${updated}
      WHERE run_id = ${run.runId} AND wait_id = ${run.activeWaitId} AND status = 'open'
    `
    yield* appendEvent(hub, run, { _tag: "RunResumed", waitId: run.activeWaitId, resolution }, "running")
  })

export const cancel = (hub: EventHub, input: CancelInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return
    yield* cancelRun(hub, run, input.reason)
  })

export const complete = (hub: EventHub, input: { readonly runId: string; readonly result: AgentResult }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      yield* cancelRun(hub, run, run.cancelReason)
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunCompleted", result: input.result }, "succeeded")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })

export const fail = (hub: EventHub, input: { readonly runId: string; readonly error: RunFailure }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) {
      yield* cancelRun(hub, run, run.cancelReason)
      return
    }
    const event = yield* appendEvent(hub, run, { _tag: "RunFailed", error: input.error }, "failed")
    const settled = (yield* loadRun(run.runId))!
    yield* settleParent(hub, settled, event.eventId)
    yield* afterTerminal(hub, settled)
  })

export const wait = (hub: EventHub, input: { readonly runId: string; readonly wait: RunWait }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const opened = yield* nowIso
    yield* sql`
      INSERT INTO baton_run_waits (run_id, wait_id, reason, status, response_json, opened_at, closed_at)
      VALUES (${run.runId}, ${input.wait.waitId}, ${input.wait.reason}, 'open', NULL, ${opened}, NULL)
      ON CONFLICT(run_id, wait_id) DO UPDATE SET
        status = 'open',
        reason = excluded.reason,
        opened_at = excluded.opened_at,
        closed_at = NULL
    `
    yield* appendEvent(hub, run, { _tag: "RunWaiting", wait: { ...input.wait, openedAt: opened } }, "waiting")
  })

export const resume = (hub: EventHub, input: { readonly runId: string; readonly waitId: string }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.activeWaitId !== input.waitId) {
      return yield* WaitNotOpen.make({ runId: run.runId, waitId: input.waitId })
    }
    yield* appendEvent(hub, run, { _tag: "RunResumed", waitId: input.waitId }, "running")
  })

export const emitAgentEvent = (hub: EventHub, input: { readonly runId: string; readonly event: AgentLoopEvent }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    yield* appendEvent(hub, run, input.event as { readonly _tag: string } & Record<string, unknown>)
  })

export const markOperationUnknown = (hub: EventHub, input: { readonly runId: string; readonly operationId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    const finished = yield* nowIso
    yield* sql`
      UPDATE baton_run_operations SET status = 'unknown', finished_at = ${finished}
      WHERE run_id = ${run.runId} AND operation_id = ${input.operationId}
    `
    yield* appendEvent(hub, run, { _tag: "OperationUnknown", operationId: input.operationId }, "needs-resolution")
  })
