import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { ExecutionClaim, ExecutionRecord } from "../run-store.js"
import { StaleClaim } from "./errors.js"
import { loadRun, loadRunWait, nowIso } from "./store-helpers.js"
import type { DecodedRun } from "./rows.js"
import { checkpointRef } from "../executable-manifest.js"
import { encodeExecutableRef, encodeJson } from "./codecs.js"
import { loadRegistrations } from "./executable-registrations.js"
import { Prompt } from "effect/unstable/ai"
import { ExecutionCheckpoint, ExecutionSuspension } from "../execution-state.js"

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
  registrations: ExecutionRecord["registrations"],
  resolution?: ExecutionRecord["resolution"],
): ExecutionRecord => ({
  runId: run.runId,
  rootRunId: run.rootRunId,
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

export const loadExecution = (runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(runId)
    const wait = yield* loadRunWait(run.runId, run.activeWaitId)
    const registrations = yield* loadRegistrations(runId)
    return executionRecord(run, registrations, wait?.resolution)
  })

export const claimExecution = (input: { readonly runId: string; readonly ownerId: string }) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const run = yield* requireRun(input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status === "waiting" || run.status === "queued" || run.status === "needs-resolution") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    const nextAttemptFence = run.attemptFence + 1
    const updated = yield* nowIso
    yield* sql`
      UPDATE baton_runs SET
        owner_worker_id = ${input.ownerId},
        attempt_fence = attempt_fence + 1,
        status = 'running',
        updated_at = ${updated}
      WHERE run_id = ${input.runId}
        AND status = 'running'
        AND attempt_fence = ${run.attemptFence}
    `
    const claimed = yield* requireRun(input.runId)
    if (claimed.ownerWorkerId !== input.ownerId || claimed.attemptFence !== nextAttemptFence) {
      return yield* StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: run.attemptFence })
    }
    const wait = yield* loadRunWait(claimed.runId, run.activeWaitId)
    const registrations = yield* loadRegistrations(input.runId)
    return { ...executionRecord(claimed, registrations, wait?.resolution), ownerId: input.ownerId }
  })

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
        transcript_json = COALESCE(${input.transcript === undefined ? null : encodeJson(Prompt.Prompt, input.transcript)}, transcript_json),
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
