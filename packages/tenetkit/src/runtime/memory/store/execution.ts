import { Effect, Function } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { ExecutionClaim, ExecutionRecord, SessionWriteClaim } from "../../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../../sql/errors.js"
import { activeChildCount } from "./child/capacity.js"
import { runWaits, type MemoryState } from "../state.js"
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
    resolutions: runWaits(state, run.runId).flatMap((wait) =>
      wait.resolution === undefined ? [] : [{ waitId: wait.waitId, resolution: wait.resolution }],
    ),
    registrations: run.registrations,
  }
  if (run.parentRunId !== undefined) record = { ...record, parentRunId: run.parentRunId }
  if (run.invocationId !== undefined) record = { ...record, invocationId: run.invocationId }
  if (run.ownerId !== undefined) record = { ...record, ownerId: run.ownerId }
  if (run.checkpoint !== undefined) record = { ...record, checkpoint: run.checkpoint }
  if (run.suspension !== undefined) record = { ...record, suspension: run.suspension }
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
  (input: ExecutionClaim): (state: MemoryState) => Effect.Effect<void, StaleClaim | StaleSessionClaim>
  (state: MemoryState, input: ExecutionClaim): Effect.Effect<void, StaleClaim | StaleSessionClaim>
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) => {
  const run = state.runs.get(input.runId)
  if (run === undefined || run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
    return Effect.fail(
      StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence }),
    )
  }
  const session = state.sessions.get(input.session.sessionId)
  return session !== undefined &&
    input.session.runId === input.runId &&
    input.session.ownerId === input.ownerId &&
    input.session.runAttemptFence === input.attemptFence &&
    session.writerEpoch.toString() === input.session.epoch &&
    session.writer?.runId === input.runId &&
    session.writer.ownerId === input.ownerId &&
    session.writer.runAttemptFence === input.attemptFence
    ? Effect.void
    : Effect.fail(StaleSessionClaim.make(input.session))
})

const acquireSession = (
  state: MemoryState,
  input: {
    readonly sessionId: string
    readonly runId: string
    readonly ownerId: string
    readonly attemptFence: number
  },
): readonly [SessionWriteClaim, MemoryState] => {
  const current = state.sessions.get(input.sessionId) ?? {
    entries: new Map(),
    order: [],
    leaf: null,
    counter: 0,
    writerEpoch: 0n,
  }
  const writerEpoch = current.writerEpoch + 1n
  const session: SessionWriteClaim = {
    sessionId: input.sessionId,
    runId: input.runId,
    ownerId: input.ownerId,
    runAttemptFence: input.attemptFence,
    epoch: writerEpoch.toString(),
  }
  return [
    session,
    {
      ...state,
      sessions: new Map(state.sessions).set(input.sessionId, {
        ...current,
        writerEpoch,
        writer: {
          runId: input.runId,
          ownerId: input.ownerId,
          runAttemptFence: input.attemptFence,
        },
      }),
    },
  ]
}

export const revokeSession: {
  (claim: ExecutionClaim): (state: MemoryState) => MemoryState
  (state: MemoryState, claim: ExecutionClaim): MemoryState
} = Function.dual(2, (state: MemoryState, claim: ExecutionClaim): MemoryState => {
  if (state.runs.get(claim.runId)?.ownerId !== undefined) return state
  const current = state.sessions.get(claim.session.sessionId)
  if (
    current === undefined ||
    current.writerEpoch.toString() !== claim.session.epoch ||
    current.writer?.runId !== claim.runId ||
    current.writer.ownerId !== claim.ownerId ||
    current.writer.runAttemptFence !== claim.attemptFence
  ) {
    return state
  }
  const { writer: _, ...revoked } = current
  return { ...state, sessions: new Map(state.sessions).set(claim.session.sessionId, revoked) }
})

export const revokeRunSession: {
  (runId: string): (state: MemoryState) => MemoryState
  (state: MemoryState, runId: string): MemoryState
} = Function.dual(2, (state: MemoryState, runId: string): MemoryState => {
  const run = state.runs.get(runId)
  if (run?.ownerId === undefined) return state
  const sessionId = run.message.sessionId
  const current = state.sessions.get(sessionId)
  if (
    current === undefined ||
    current.writer?.runId !== run.runId ||
    current.writer.ownerId !== run.ownerId ||
    current.writer.runAttemptFence !== run.attemptFence
  ) {
    return state
  }
  const { writer: _, ...revoked } = current
  return { ...state, sessions: new Map(state.sessions).set(sessionId, revoked) }
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
  return Effect.succeed([undefined, revokeSession({ ...state, runs }, input)] as const)
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
    const activeSession = state.sessions.get(run.message.sessionId)
    if (activeSession?.writer !== undefined && activeSession.writer.runId !== run.runId) {
      return yield* RuntimeUnavailable.make({
        message: `Session ${run.message.sessionId} is already bound to Run ${activeSession.writer.runId}`,
      })
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
    const [session, withSession] = acquireSession(started, {
      sessionId: loaded.message.sessionId,
      runId: loaded.runId,
      ownerId: input.ownerId,
      attemptFence: loaded.attemptFence,
    })
    return [{ ...executionRecord(withSession, loaded), ownerId: input.ownerId, session }, withSession] as const
  }),
)

export const retryExecution: {
  (
    input: ExecutionClaim,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [ExecutionRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim | StaleSessionClaim
  >
  (
    state: MemoryState,
    input: ExecutionClaim,
  ): Effect.Effect<
    readonly [ExecutionRecord, MemoryState],
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim | StaleSessionClaim
  >
} = Function.dual(2, (state: MemoryState, input: ExecutionClaim) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status !== "running") {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    yield* requireExecutionClaim(state, input)
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
