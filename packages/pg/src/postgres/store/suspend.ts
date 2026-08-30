import { Effect, Equal, Function } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "tenetkit/runtime/driver/errors"
import { StaleClaim } from "tenetkit/runtime/driver/sql/errors"
import type { SqlError } from "effect/unstable/sql/SqlError"
import { checkpointRef } from "tenetkit/runtime/driver/executable/manifest"
import { isTerminal } from "tenetkit/runtime/driver/run"
import type { Service as RunStoreService } from "tenetkit/runtime/driver/run/store"
import { encodeContinuation } from "tenetkit/runtime/driver/run/steering"
import { encodeExecutableRef, encodeJson } from "tenetkit/runtime/driver/sql/codec/codecs"
import type { EventHub } from "tenetkit/runtime/driver/sql/subscribers"
import { encodeReason } from "tenetkit/runtime/driver/run/wait"
import { lockRun } from "../runs/locks.js"
import { appendEvent, requireRun } from "./runtime.js"
import { requireExecutionClaim } from "tenetkit/runtime/driver/sql/store/execution"
import { groupWaitsFromSuspension, resultFromInspection } from "tenetkit/runtime/driver/child/group"
import { inspectFanOut } from "tenetkit/runtime/driver/sql/store/fan-out/service"
import { ExecutionCheckpoint, ExecutionSuspension } from "tenetkit/runtime/driver/execution/state"
import { loadTerminalEvent, reconcileChildWaitWith } from "tenetkit/runtime/driver/sql/store/child/settlement"
import { revokeSessionWriteClaim } from "tenetkit/runtime/driver/sql/session/claim"
import { loadRunWait, nowIso, transitionRunWait } from "tenetkit/runtime/driver/sql/store/statements"
import type { DecodedRun } from "tenetkit/runtime/driver/sql/codec/rows"

type SuspendInput = Parameters<RunStoreService["suspend"]>[0]
type SuspendEffect = Effect.Effect<
  undefined,
  RunNotFound | RunTerminal | RuntimeUnavailable | SqlError | StaleClaim,
  SqlClient.SqlClient
>

const suspensionTokens = (suspension: SuspendInput["suspension"]): ReadonlyArray<string> => {
  if (suspension._tag === "tenetkit/core/AgentSuspended") return suspension.waits.map((wait) => wait.token)
  return suspension.token === undefined ? [] : [suspension.token]
}

const persistWaits = (runId: string, waits: SuspendInput["waits"]) =>
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
          INSERT INTO tenetkit_run_waits (
            run_id, wait_id, authored_order, reason, status, response_json, due_at, owner_worker_id, lease_expires_at, opened_at, closed_at
          ) VALUES (
            ${runId}, ${requested.waitId}, ${authoredOrder}, ${encodeReason(requested.reason)}, 'open', NULL, NULL, NULL, NULL, NOW(), NULL
          )
        `
        inserted.push(requested)
      } else if (prior.status !== "open" || !Equal.equals(prior.reason, requested.reason)) {
        return yield* RuntimeUnavailable.make({ message: `Wait ${requested.waitId} cannot be reopened or changed` })
      }
    }
    return inserted
  })

const appendWaits = (hub: EventHub, loaded: DecodedRun, inserted: SuspendInput["waits"]) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    let current = loaded
    for (const wait of inserted) {
      yield* appendEvent(hub, current, { _tag: "RunWaiting", wait }, "waiting")
      current = yield* requireRun(loaded.runId)
    }
    if (inserted.length === 0) {
      yield* sql`UPDATE tenetkit_runs SET status = 'waiting', updated_at = NOW() WHERE run_id = ${loaded.runId}`
    }
  })

const reconcileChildren = (hub: EventHub, runId: string, tokens: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    for (const token of tokens) {
      const child = yield* requireRun(token).pipe(Effect.option)
      if (child._tag === "None" || child.value.terminalEventId === undefined) continue
      const terminalEvent = yield* loadTerminalEvent(child.value.terminalEventId)
      if (terminalEvent === undefined) continue
      yield* reconcileChildWaitWith({
        hub,
        parent: yield* requireRun(runId),
        child: child.value,
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
        SELECT parent_run_id, status FROM tenetkit_fan_outs WHERE fan_out_id = ${owned.groupId}
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
        yield* requireRun(runId),
        { _tag: "RunResumed", waitId: owned.waitId, resolution },
        "running",
      )
    }
  })

export const suspend: {
  (input: SuspendInput): (hub: EventHub) => SuspendEffect
  (hub: EventHub, input: SuspendInput): SuspendEffect
} = Function.dual(2, (hub: EventHub, input: SuspendInput) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(input.runId)
    yield* requireExecutionClaim(input)
    const loaded = yield* requireRun(input.runId)
    if (isTerminal(loaded.status)) {
      return yield* RunTerminal.make({ runId: loaded.runId, status: loaded.status })
    }
    if (loaded.cancellationRequested) return
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
        updated_at = NOW()
      WHERE run_id = ${input.runId}
    `
    const inserted = yield* persistWaits(loaded.runId, input.waits)
    yield* appendWaits(hub, loaded, inserted)
    yield* reconcileChildren(hub, loaded.runId, suspensionTokens(input.suspension))
    yield* reconcileGroups(hub, loaded.runId, input.suspension)
    yield* sql`UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL WHERE run_id = ${loaded.runId}`
    if (!(yield* revokeSessionWriteClaim(input.session))) {
      return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} Session write binding was not revoked` })
    }
  }),
)
