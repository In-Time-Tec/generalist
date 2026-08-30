import { Effect, Function } from "effect"
import { SqlClient, SqlError } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { ExecutionClaim, ExecutionRecord } from "../../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../errors.js"
import { appendEvent, loadRun, loadRunWaits, lockRun, nowIso } from "./statements.js"
import type { DecodedRun } from "../codec/rows.js"
import { checkpointRef } from "../../executable/manifest.js"
import { encodeExecutableRef, encodeJson } from "../codec/codecs.js"
import { loadRegistrations } from "../executable/registrations.js"
import { ExecutionCheckpoint, ExecutionSuspension } from "../../execution/state.js"
import type { EventHub } from "../subscribers.js"
import { activeChildCount } from "./child/capacity.js"
import { acquireSessionWriteClaim, requireSessionWriteClaim, revokeSessionWriteClaim } from "../session/claim.js"

const requireRun = (runId: string) =>
  loadRun(runId).pipe(Effect.flatMap((run) => (run === undefined ? RunNotFound.make({ runId }) : Effect.succeed(run))))

export const requireExecutionClaim = (input: ExecutionClaim) =>
  Effect.gen(function* () {
    yield* lockRun(input.runId)
    const run = yield* requireRun(input.runId)
    if (run.ownerWorkerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
    }
    if (
      input.session.runId !== input.runId ||
      input.session.ownerId !== input.ownerId ||
      input.session.runAttemptFence !== input.attemptFence ||
      input.session.sessionId !== run.sessionId
    ) {
      return yield* StaleSessionClaim.make(input.session)
    }
    yield* requireSessionWriteClaim(input.session)
  })

const executionRecord = (
  run: DecodedRun,
  childCount: number,
  registrations: ExecutionRecord["registrations"],
  resolutions: ExecutionRecord["resolutions"],
): ExecutionRecord => {
  const record: ExecutionRecord = {
    runId: run.runId,
    rootRunId: run.rootRunId,
    depth: run.depth,
    treePolicy: run.treePolicy,
    activeChildCount: childCount,
    admittedAt: run.admittedAt,
    message: run.message,
    executableRef: run.executableRef,
    executableManifest: run.executableManifest,
    attempt: run.attempt,
    attemptFence: run.attemptFence,
    cancellationRequested: run.cancellationRequested,
    resolutions,
    registrations,
  }
  if (run.parentRunId !== undefined) Object.assign(record, { parentRunId: run.parentRunId })
  if (run.invocationId !== undefined) Object.assign(record, { invocationId: run.invocationId })
  if (run.ownerWorkerId !== undefined) Object.assign(record, { ownerId: run.ownerWorkerId })
  if (run.driverCheckpoint !== undefined) Object.assign(record, { checkpoint: run.driverCheckpoint })
  if (run.suspension !== undefined) Object.assign(record, { suspension: run.suspension })
  if (run.continuation !== undefined) Object.assign(record, { continuation: run.continuation })
  return record
}

export const loadExecution = (runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(runId)
    const resolutions = (yield* loadRunWaits(run.runId)).flatMap((wait) =>
      wait.resolution === undefined ? [] : [{ waitId: wait.waitId, resolution: wait.resolution }],
    )
    const registrations = yield* loadRegistrations(runId)
    return executionRecord(run, yield* activeChildCount(runId), registrations, resolutions)
  })

export const releaseExecution = (input: ExecutionClaim) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(input.runId)
    const run = yield* loadRun(input.runId)
    if (run === undefined || run.ownerWorkerId !== input.ownerId || run.attemptFence !== input.attemptFence) return
    yield* requireSessionWriteClaim(input.session).pipe(
      Effect.mapError(() => RuntimeUnavailable.make({ message: `Run ${input.runId} lost its Session write binding` })),
    )
    const updated = yield* nowIso
    const released = yield* sql.onDialectOrElse({
      mysql: () =>
        Effect.gen(function* () {
          yield* sql`
            UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL, updated_at = ${updated}
            WHERE run_id = ${input.runId}
              AND owner_worker_id = ${input.ownerId}
              AND attempt_fence = ${input.attemptFence}
          `
          const rows = yield* sql<{ readonly affected: number | string }>`SELECT ROW_COUNT() AS affected`
          return Number(rows[0]?.affected ?? 0)
        }),
      pg: () =>
        sql<{ readonly run_id: string }>`
          UPDATE tenetkit_runs SET owner_worker_id = NULL, lease_expires_at = NULL, updated_at = ${updated}
          WHERE run_id = ${input.runId}
            AND owner_worker_id = ${input.ownerId}
            AND attempt_fence = ${input.attemptFence}
          RETURNING run_id
        `.pipe(Effect.map((rows) => rows.length)),
      orElse: () =>
        sql<{ readonly run_id: string }>`
          UPDATE tenetkit_runs SET owner_worker_id = NULL, updated_at = ${updated}
          WHERE run_id = ${input.runId}
            AND owner_worker_id = ${input.ownerId}
            AND attempt_fence = ${input.attemptFence}
          RETURNING run_id
        `.pipe(Effect.map((rows) => rows.length)),
    })
    if (released !== 1) {
      return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} execution claim was not released` })
    }
    const revoked = yield* revokeSessionWriteClaim(input.session)
    if (!revoked) {
      return yield* RuntimeUnavailable.make({ message: `Run ${input.runId} Session write binding was not revoked` })
    }
  })

export const claimExecution: {
  (input: { readonly runId: string; readonly ownerId: string }): (hub: EventHub) => ReturnType<typeof claimExecution>
  (
    hub: EventHub,
    input: { readonly runId: string; readonly ownerId: string },
  ): Effect.Effect<
    ExecutionRecord & ExecutionClaim,
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim,
    SqlClient.SqlClient
  >
} = Function.dual(2, (hub: EventHub, input: { readonly runId: string; readonly ownerId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* lockRun(input.runId)
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status === "waiting" || run.status === "needs-resolution") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    if (run.status === "queued") {
      if (run.parentRunId === undefined) {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is queued` })
      }
      const links = yield* sql<{ readiness: string }>`
        SELECT readiness FROM tenetkit_run_links WHERE child_run_id = ${run.runId} LIMIT 1
      `
      if (links[0]?.readiness !== "ready") {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is awaiting child capacity` })
      }
    }
    const nextAttemptFence = run.attemptFence + 1
    const nextAttempt = run.status === "queued" ? run.attempt + 1 : run.attempt
    const updated = yield* nowIso
    yield* sql`
      UPDATE tenetkit_runs SET
        owner_worker_id = ${input.ownerId},
        attempt_fence = attempt_fence + 1,
        attempt = ${nextAttempt},
        status = CASE WHEN cancellation_requested THEN 'cancelling' ELSE 'running' END,
        updated_at = ${updated}
      WHERE run_id = ${input.runId}
        AND status IN ('queued', 'running', 'cancelling')
        AND attempt_fence = ${run.attemptFence}
    `
    const claimed = yield* requireRun(input.runId)
    if (claimed.ownerWorkerId !== input.ownerId || claimed.attemptFence !== nextAttemptFence) {
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: run.attemptFence })
    }
    const session = yield* acquireSessionWriteClaim({
      sessionId: claimed.sessionId,
      runId: claimed.runId,
      ownerId: input.ownerId,
      runAttemptFence: claimed.attemptFence,
    })
    if (run.status === "queued") {
      yield* appendEvent(hub, claimed, { _tag: "RunAttemptStarted", attempt: claimed.attempt }, "running")
    }
    const started = run.status === "queued" ? yield* requireRun(input.runId) : claimed
    const resolutions = (yield* loadRunWaits(started.runId)).flatMap((wait) =>
      wait.resolution === undefined ? [] : [{ waitId: wait.waitId, resolution: wait.resolution }],
    )
    const registrations = yield* loadRegistrations(input.runId)
    return {
      ...executionRecord(started, yield* activeChildCount(input.runId), registrations, resolutions),
      ownerId: input.ownerId,
      session,
    }
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
    if (run.status !== "running") {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    yield* requireExecutionClaim(input)
    const attempt = run.attempt + 1
    yield* appendEvent(hub, { ...run, attempt }, { _tag: "RunAttemptStarted", attempt }, "running")
    return yield* loadExecution(input.runId)
  }),
)

export const saveExecution = (
  input: ExecutionClaim & {
    readonly checkpoint?: ExecutionRecord["checkpoint"]
    readonly suspension?: ExecutionRecord["suspension"]
  },
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* requireExecutionClaim(input)
    const run = yield* requireRun(input.runId)
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const updated = yield* nowIso
    const rows = yield* sql<{ run_id: string }>`
      UPDATE tenetkit_runs SET
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
