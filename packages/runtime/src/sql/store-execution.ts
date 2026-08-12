import { Effect, Function } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { ExecutionClaim, ExecutionRecord } from "../run-store.js"
import { StaleClaim } from "./errors.js"
import { appendEvent, loadRun, loadRunWait, nowIso } from "./store-helpers.js"
import type { DecodedRun } from "./rows.js"
import { checkpointRef } from "../executable-manifest.js"
import { encodeExecutableRef, encodeJson } from "./codecs.js"
import { loadRegistrations } from "./executable-registrations.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../execution-state.js"
import type { EventHub } from "./subscribers.js"

const requireRun = (runId: string) =>
  loadRun(runId).pipe(Effect.flatMap((run) => (run === undefined ? RunNotFound.make({ runId }) : Effect.succeed(run))))

export const requireExecutionClaim = (input: ExecutionClaim) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (run.ownerWorkerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
    }
  })

const executionRecord = (
  run: DecodedRun,
  directChildCount: number,
  registrations: ExecutionRecord["registrations"],
  resolution?: ExecutionRecord["resolution"],
): ExecutionRecord => ({
  runId: run.runId,
  rootRunId: run.rootRunId,
  depth: run.depth,
  treePolicy: run.treePolicy,
  directChildCount,
  ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
  ...(run.invocationId === undefined ? {} : { invocationId: run.invocationId }),
  ...(run.ownerWorkerId === undefined ? {} : { ownerId: run.ownerWorkerId }),
  admittedAt: run.admittedAt,
  message: run.message,
  executableRef: run.executableRef,
  executableManifest: run.executableManifest,
  attempt: run.attempt,
  attemptFence: run.attemptFence,
  ...(run.driverCheckpoint === undefined ? {} : { checkpoint: run.driverCheckpoint }),
  ...(run.suspension === undefined ? {} : { suspension: run.suspension }),
  ...(resolution === undefined ? {} : { resolution }),
  ...(run.transcript === undefined ? {} : { transcript: run.transcript }),
  ...(run.continuation === undefined ? {} : { continuation: run.continuation }),
  registrations,
})

const loadDirectChildCount = (runId: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ child_count: number | string }>`
      SELECT COUNT(*) AS child_count FROM baton_run_links WHERE parent_run_id = ${runId}
    `
    return Number(rows[0]?.child_count ?? 0)
  })

export const loadExecution = (runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(runId)
    const wait = yield* loadRunWait(run.runId, run.activeWaitId)
    const registrations = yield* loadRegistrations(runId)
    const directChildCount = yield* loadDirectChildCount(runId)
    return executionRecord(run, directChildCount, registrations, wait?.resolution)
  })

export const claimExecution: {
  (input: { readonly runId: string; readonly ownerId: string }): (hub: EventHub) => ReturnType<typeof claimExecution>
  (
    hub: EventHub,
    input: { readonly runId: string; readonly ownerId: string },
  ): Effect.Effect<
    ExecutionRecord & { readonly ownerId: string },
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim,
    SqlClient.SqlClient
  >
} = Function.dual(2, (hub: EventHub, input: { readonly runId: string; readonly ownerId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status === "waiting" || run.status === "needs-resolution") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    if (run.status === "queued") {
      if (run.parentRunId === undefined) {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is queued` })
      }
      const members = yield* sql<{ status: string }>`
        SELECT status FROM baton_fan_out_members WHERE child_run_id = ${run.runId} LIMIT 1
      `
      if (members[0]?.status !== undefined && members[0].status !== "running") {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is awaiting fan-out admission` })
      }
    }
    const nextAttemptFence = run.attemptFence + 1
    const nextAttempt = run.status === "queued" ? run.attempt + 1 : run.attempt
    const updated = yield* nowIso
    yield* sql`
      UPDATE baton_runs SET
        owner_worker_id = ${input.ownerId},
        attempt_fence = attempt_fence + 1,
        attempt = ${nextAttempt},
        status = 'running',
        updated_at = ${updated}
      WHERE run_id = ${input.runId}
        AND status IN ('queued', 'running')
        AND attempt_fence = ${run.attemptFence}
    `
    const claimed = yield* requireRun(input.runId)
    if (claimed.ownerWorkerId !== input.ownerId || claimed.attemptFence !== nextAttemptFence) {
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: run.attemptFence })
    }
    if (run.status === "queued") {
      yield* appendEvent(hub, claimed, { _tag: "RunAttemptStarted", attempt: claimed.attempt }, "running")
    }
    const started = run.status === "queued" ? yield* requireRun(input.runId) : claimed
    const wait = yield* loadRunWait(started.runId, started.activeWaitId)
    const registrations = yield* loadRegistrations(input.runId)
    const directChildCount = yield* loadDirectChildCount(input.runId)
    return { ...executionRecord(started, directChildCount, registrations, wait?.resolution), ownerId: input.ownerId }
  }),
)

export const retryExecution: {
  (input: ExecutionClaim): (hub: EventHub) => ReturnType<typeof retryExecution>
  (
    hub: EventHub,
    input: ExecutionClaim,
  ): Effect.Effect<
    ExecutionRecord,
    RunNotFound | RunTerminal | RuntimeUnavailable | SqlError.SqlError | StaleClaim,
    SqlClient.SqlClient
  >
} = Function.dual(2, (hub: EventHub, input: ExecutionClaim) =>
  Effect.gen(function* () {
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status !== "running" || run.ownerWorkerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    const attempt = run.attempt + 1
    yield* appendEvent(hub, { ...run, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
    return yield* loadExecution(input.runId)
  }),
)

export const saveExecution = (
  input: ExecutionClaim & {
    readonly checkpoint?: ExecutionRecord["checkpoint"]
    readonly suspension?: ExecutionRecord["suspension"]
    readonly transcript?: ExecutionRecord["transcript"]
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const updated = yield* nowIso
    const rows = yield* sql<{ run_id: string }>`
      UPDATE baton_runs SET
        driver_checkpoint_json = COALESCE(${input.checkpoint === undefined ? null : encodeJson(ExecutionCheckpoint, input.checkpoint)}, driver_checkpoint_json),
        executable_ref_json = ${encodeExecutableRef(executableRef)},
        suspension_json = COALESCE(${input.suspension === undefined ? null : encodeJson(ExecutionSuspension, input.suspension)}, suspension_json),
        updated_at = ${updated}
      WHERE run_id = ${input.runId}
        AND owner_worker_id = ${input.ownerId}
        AND attempt_fence = ${input.attemptFence}
      RETURNING run_id
    `
    if (rows.length === 0) {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
  })
