import { Effect, Function } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { ExecutionClaim, ExecutionRecord } from "../../run/store.js"
import { StaleClaim } from "../../sql/errors.js"
import { activeChildCount } from "./child/capacity.js"
import type { MemoryState } from "../state.js"
import { checkpointRef } from "../../executable/manifest.js"
import { appendLifecycle, attemptStartedEvent } from "../append.js"

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const executionRecord = (
  state: MemoryState,
  run: MemoryState["runs"] extends ReadonlyMap<string, infer R> ? R : never,
): ExecutionRecord => {
  let record: ExecutionRecord = {
    runId: run.runId,
    rootRunId: run.rootRunId,
    depth: run.depth,
    treePolicy: run.treePolicy,
    activeChildCount: activeChildCount(state, run),
    admittedAt: run.events[0]!.occurredAt,
    message: run.message,
    executableRef: run.executableRef,
    executableManifest: run.executableManifest,
    attempt: run.attempt,
    attemptFence: run.attemptFence,
    cancellationRequested: run.cancellationRequested,
    registrations: run.registrations,
  }
  if (run.parentRunId !== undefined) record = { ...record, parentRunId: run.parentRunId }
  if (run.invocationId !== undefined) record = { ...record, invocationId: run.invocationId }
  if (run.ownerId !== undefined) record = { ...record, ownerId: run.ownerId }
  if (run.checkpoint !== undefined) record = { ...record, checkpoint: run.checkpoint }
  if (run.suspension !== undefined) record = { ...record, suspension: run.suspension }
  if (run.wait?.resolution !== undefined) record = { ...record, resolution: run.wait.resolution }
  if (run.continuation !== undefined) record = { ...record, continuation: run.continuation }
  return record
}

export const loadExecution: {
  (runId: string): (state: MemoryState) => Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, runId)
    return executionRecord(state, run)
  }),
)

export const requireExecutionClaim: {
  (input: ExecutionClaim): (state: MemoryState) => Effect.Effect<void, never, never> | StaleClaim
  (state: MemoryState, input: ExecutionClaim): Effect.Effect<void, never, never> | StaleClaim
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) => {
  const run = state.runs.get(input.runId)
  return run !== undefined && run.ownerId === input.ownerId && run.attemptFence === input.attemptFence
    ? Effect.void
    : StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
})

export const releaseExecution: {
  (input: ExecutionClaim): (state: MemoryState) => Effect.Effect<readonly [void, MemoryState], RuntimeUnavailable>
  (state: MemoryState, input: ExecutionClaim): Effect.Effect<readonly [void, MemoryState], RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(input.runId)
  if (run === undefined || run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
    return Effect.succeed([undefined, state] as const)
  }
  const { ownerId: _, ...released } = run
  const runs = new Map(state.runs)
  runs.set(run.runId, released)
  return Effect.succeed([undefined, { ...state, runs }] as const)
})

export const claimExecution: {
  (input: {
    readonly runId: string
    readonly ownerId: string
  }): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ExecutionRecord & ExecutionClaim, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable
  >
  (
    state: MemoryState,
    input: { readonly runId: string; readonly ownerId: string },
  ): Effect.Effect<
    readonly [ExecutionRecord & ExecutionClaim, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable
  >
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly ownerId: string }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status === "waiting" || run.status === "needs-resolution") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    if (run.status === "queued") {
      if (run.parentRunId === undefined) {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is queued` })
      }
      if (run.childReadiness !== "ready") {
        return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is awaiting child capacity` })
      }
    }
    const claimed = {
      ...run,
      status: run.cancellationRequested ? ("cancelling" as const) : ("running" as const),
      ownerId: input.ownerId,
      attemptFence: run.attemptFence + 1,
      attempt: run.status === "queued" ? run.attempt + 1 : run.attempt,
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, claimed)
    const claimedState = { ...state, runs }
    const started =
      run.status === "queued"
        ? (yield* appendLifecycle(claimedState, run.runId, attemptStartedEvent(claimed.attempt), "running"))[1]
        : claimedState
    const loaded = started.runs.get(run.runId)!
    return [{ ...executionRecord(started, loaded), ownerId: input.ownerId }, started] as const
  }),
)

export const retryExecution: {
  (
    input: ExecutionClaim,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ExecutionRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim
  >
  (
    state: MemoryState,
    input: ExecutionClaim,
  ): Effect.Effect<readonly [ExecutionRecord, MemoryState], RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim>
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status !== "running" || run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    const nextAttempt = run.attempt + 1
    const [_, next] = yield* appendLifecycle(state, run.runId, attemptStartedEvent(nextAttempt), "running")
    return [executionRecord(next, next.runs.get(run.runId)!), next] as const
  }),
)

export const saveExecution: {
  (
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionRecord["checkpoint"]
      readonly suspension?: ExecutionRecord["suspension"]
    },
  ): (state: MemoryState) => Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable | StaleClaim>
  (
    state: MemoryState,
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionRecord["checkpoint"]
      readonly suspension?: ExecutionRecord["suspension"]
    },
  ): Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable | StaleClaim>
} = Function.dual(
  2,
  (
    state: MemoryState,
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionRecord["checkpoint"]
      readonly suspension?: ExecutionRecord["suspension"]
    },
  ) =>
    Effect.gen(function* () {
      const run = yield* requireRun(state, input.runId)
      if (run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
        return yield* StaleClaim.make({
          runId: input.runId,
          workerId: input.ownerId,
          attemptFence: input.attemptFence,
        })
      }
      const executableRef = yield* Effect.try({
        try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      const runs = new Map(state.runs)
      const { checkpoint: _, suspension: __, ...withoutSavedState } = run
      let saved: typeof run = {
        ...withoutSavedState,
        executableRef,
      }
      if (input.checkpoint !== undefined) saved = { ...saved, checkpoint: input.checkpoint }
      if (input.suspension !== undefined) saved = { ...saved, suspension: input.suspension }
      runs.set(run.runId, saved)
      return { ...state, runs }
    }),
)
