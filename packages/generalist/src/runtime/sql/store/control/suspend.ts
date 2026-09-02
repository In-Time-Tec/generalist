import { Effect, Equal, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import { isTerminal } from "../../../run.js"
import type { Service as RunStoreService } from "../../../run/store.js"
import { encodeReason } from "../../../run/wait-internal.js"
import { checkpointRef } from "../../../executable/manifest-internal.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../../execution/state.js"
import { encodeContinuation } from "../../../run/steering.js"
import { encodeExecutableRef, encodeJson } from "../../codec/codecs.js"
import type { DecodedRun } from "../../codec/rows.js"
import type { EventHub } from "../../subscribers.js"
import { groupWaitsFromSuspension, resultFromInspection } from "../../../child/group.js"
import { inspectFanOut } from "../fan-out/service.js"
import { loadTerminalEvent, reconcileChildWaitWith } from "../child/settlement.js"
import { revokeExecutionSessionWriteClaim } from "../../session/claim.js"
import {
  appendEvent,
  clearLeaseOnOwnerRelease,
  loadRun,
  loadRunWait,
  nowIso,
  transitionRunWait,
} from "../statements.js"

type SuspendInput = Parameters<RunStoreService["suspend"]>[0]
type SuspendEffect = Effect.Effect<
  undefined,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError,
  SqlClient.SqlClient
>

const requireRun = (runId: string) =>
  loadRun(runId).pipe(
    Effect.flatMap((run) => (run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run))),
  )

const suspensionTokens = (suspension: SuspendInput["suspension"]): ReadonlyArray<string> => {
  if (suspension._tag === "generalist/core/AgentSuspended") return suspension.waits.map((wait) => wait.token)
  if (suspension._tag === "generalist/core/ProgramSuspended") {
    return suspension.token === undefined ? [] : [suspension.token]
  }
  return []
}

const persistWaits = (runId: string, waits: SuspendInput["waits"], openedAt: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const inserted: Array<(typeof waits)[number]> = []
    const identities = new Set<string>()
    for (const [authoredOrder, requested] of waits.entries()) {
      if (requested.status !== "open" || identities.has(requested.waitId)) {
        return yield* RuntimeUnavailable.make({ message: `Invalid wait batch for Run ${runId}` })
      }
      identities.add(requested.waitId)
      const prior = yield* loadRunWait(runId, requested.waitId)
      if (prior === undefined) {
        yield* sql`
          INSERT INTO generalist_run_waits (run_id, wait_id, authored_order, reason, status, response_json, opened_at, closed_at)
          VALUES (${runId}, ${requested.waitId}, ${authoredOrder}, ${encodeReason(requested.reason)}, 'open', NULL, ${openedAt}, NULL)
        `
        inserted.push({ ...requested, openedAt })
      } else if (prior.status !== "open" || !Equal.equals(prior.reason, requested.reason)) {
        return yield* RuntimeUnavailable.make({ message: `Wait ${requested.waitId} cannot be reopened or changed` })
      }
    }
    return inserted
  })

const appendWaits = (hub: EventHub, loaded: DecodedRun, inserted: SuspendInput["waits"], openedAt: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let current = loaded
    for (const wait of inserted) {
      yield* appendEvent(hub, current, { _tag: "RunWaiting", wait }, "waiting")
      current = (yield* loadRun(loaded.runId))!
    }
    if (inserted.length === 0) {
      yield* sql`UPDATE generalist_runs SET status = 'waiting', updated_at = ${openedAt} WHERE run_id = ${loaded.runId}`
    }
  })

const reconcileChildren = (hub: EventHub, runId: string, tokens: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    for (const token of tokens) {
      const child = yield* loadRun(token)
      const terminalEvent =
        child?.terminalEventId === undefined ? undefined : yield* loadTerminalEvent(child.terminalEventId)
      if (child === undefined || terminalEvent === undefined) continue
      yield* reconcileChildWaitWith({
        hub,
        parent: (yield* loadRun(runId))!,
        child,
        event: terminalEvent,
        append: appendEvent,
      })
    }
  })

const reconcileGroups = (hub: EventHub, runId: string, suspension: SuspendInput["suspension"]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    for (const owned of groupWaitsFromSuspension(suspension)) {
      const rows = yield* sql<{ parent_run_id: string; status: string }>`
        SELECT parent_run_id, status FROM generalist_fan_outs WHERE fan_out_id = ${owned.groupId}
      `
      const group = rows[0]
      if (group?.parent_run_id !== runId || group.status === "running") continue
      const resolution = {
        _tag: "Signal" as const,
        name: owned.waitId,
        payload: resultFromInspection(
          yield* inspectFanOut(owned.groupId).pipe(
            Effect.mapError(() => RuntimeUnavailable.make({ message: `child group ${owned.groupId} disappeared` })),
          ),
        ),
      }
      const affected = yield* transitionRunWait({
        runId,
        waitId: owned.waitId,
        status: "signaled",
        resolution,
        closedAt: yield* nowIso,
      })
      if (affected !== 1) continue
      yield* appendEvent(
        hub,
        (yield* loadRun(runId))!,
        { _tag: "RunResumed", waitId: owned.waitId, resolution },
        "running",
      )
    }
  })

export const suspend: {
  (input: SuspendInput): (hub: EventHub) => SuspendEffect
  (hub: EventHub, input: SuspendInput): SuspendEffect
} = Function.dual(2, (hub: EventHub, input: SuspendInput) => {
  const checkpoint = input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)
  const continuationChanged = input.continuation === undefined ? 0 : 1
  const continuation =
    input.continuation === null || input.continuation === undefined ? null : encodeContinuation(input.continuation)
  return Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.cancellationRequested) return
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const opened = yield* nowIso
    yield* sql`
      UPDATE generalist_runs SET
        driver_checkpoint_json = COALESCE(${checkpoint}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = ${encodeJson(ExecutionSuspension, input.suspension)},
        continuation_json = CASE WHEN ${continuationChanged} = 1
          THEN ${continuation}
          ELSE continuation_json END,
        updated_at = ${opened}
      WHERE run_id = ${input.runId}
    `
    const inserted = yield* persistWaits(run.runId, input.waits, opened)
    yield* appendWaits(hub, run, inserted, opened)
    yield* reconcileChildren(hub, run.runId, suspensionTokens(input.suspension))
    yield* reconcileGroups(hub, run.runId, input.suspension)
    yield* sql`
      UPDATE generalist_runs SET owner_worker_id = NULL${clearLeaseOnOwnerRelease(sql)} WHERE run_id = ${run.runId}
    `
    yield* revokeExecutionSessionWriteClaim(input)
  })
})
