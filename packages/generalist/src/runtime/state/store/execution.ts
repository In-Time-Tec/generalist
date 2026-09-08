import { type PreparedObservation, occurredAtMillis } from "../observation.js"
import { Effect, Function, Schema } from "effect"
import { Checkpoint as ComponentCheckpoint } from "../../../core/durable/component/state.js"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../errors.js"
import { isTerminal } from "../../run.js"
import type { ExecutionClaim, ExecutionRecord, SessionWriteClaim } from "../../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../../run/ownership-errors.js"
import { activeChildCount, requireFamilyCapacity } from "./child/capacity.js"
import { runWaits, type RuntimeState, type StoredRun } from "../projection.js"
import { checkpointRef } from "../../executable/manifest-internal.js"
import { appendLifecycle, attemptStartedEvent } from "../append.js"
import { requireExecutionClaim } from "./claim.js"

const requireRun = (state: RuntimeState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const executionRecord = (
  state: RuntimeState,
  run: RuntimeState["runs"] extends ReadonlyMap<string, infer R> ? R : never,
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
  const components = state.sessions.get(run.message.sessionId)?.components
  if (components !== undefined) record = { ...record, sessionComponents: components }
  if (run.invocationId !== undefined) record = { ...record, invocationId: run.invocationId }
  if (run.ownerId !== undefined) record = { ...record, ownerId: run.ownerId }
  if (run.checkpoint !== undefined) record = { ...record, checkpoint: run.checkpoint }
  if (run.operationNamespace !== undefined) record = { ...record, operationNamespace: run.operationNamespace }
  if (run.suspension !== undefined) record = { ...record, suspension: run.suspension }
  if (run.continuation !== undefined) record = { ...record, continuation: run.continuation }
  return record
}

export const loadExecution: {
  (runId: string): (state: RuntimeState) => Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
  (state: RuntimeState, runId: string): Effect.Effect<ExecutionRecord, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: RuntimeState, runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, runId)
    return executionRecord(state, run)
  }),
)

const acquireSession = (
  state: RuntimeState,
  input: {
    readonly sessionId: string
    readonly runId: string
    readonly ownerId: string
    readonly attemptFence: number
  },
): readonly [SessionWriteClaim, RuntimeState] => {
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
  (claim: ExecutionClaim): (state: RuntimeState) => RuntimeState
  (state: RuntimeState, claim: ExecutionClaim): RuntimeState
} = Function.dual(2, (state: RuntimeState, claim: ExecutionClaim): RuntimeState => {
  if (claim.session === undefined) return state
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
  (runId: string): (state: RuntimeState) => RuntimeState
  (state: RuntimeState, runId: string): RuntimeState
} = Function.dual(2, (state: RuntimeState, runId: string): RuntimeState => {
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
  (
    input: ExecutionClaim,
  ): (state: RuntimeState) => Effect.Effect<readonly [void, RuntimeState], RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    input: ExecutionClaim,
  ): Effect.Effect<readonly [void, RuntimeState], RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, input: ExecutionClaim) => {
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

const requireClaimable = (state: RuntimeState, run: StoredRun, now: number) =>
  Effect.gen(function* () {
    const lease = run.ownerId === undefined ? undefined : state.workers.get(run.ownerId)
    if (run.ownerId !== undefined && (lease === undefined || lease.expiresAt > now)) {
      return yield* RuntimeUnavailable.make({ message: `Run ${run.runId} is owned by ${run.ownerId}` })
    }
    if (run.status === "waiting" || run.status === "needs-resolution") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    yield* requireFamilyCapacity({ state, run, now })
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
  })

export const claimExecution: {
  (input: {
    readonly runId: string
    readonly ownerId: string
  }): (
    state: RuntimeState,
  ) => Effect.Effect<
    readonly [ExecutionRecord & ExecutionClaim, RuntimeState],
    RunNotFound | RunTerminal | RuntimeUnavailable,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: { readonly runId: string; readonly ownerId: string },
  ): Effect.Effect<
    readonly [ExecutionRecord & ExecutionClaim, RuntimeState],
    RunNotFound | RunTerminal | RuntimeUnavailable,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: { readonly runId: string; readonly ownerId: string }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (state.hostSessions.get(run.message.sessionId)?.session.lifecycle !== undefined && !run.cancellationRequested)
      return yield* RuntimeUnavailable.make({ message: `Session ${run.message.sessionId} is not open` })
    const now = yield* occurredAtMillis
    yield* requireClaimable(state, run, now)
    const claimed = {
      ...run,
      initialSessionComponents:
        run.initialSessionComponents ?? state.sessions.get(run.message.sessionId)?.components ?? [],
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
    if (
      loaded.executableManifest.entries.some(
        (entry) => entry.pin === loaded.executableRef.active && entry._tag === "Tool",
      )
    )
      return [{ ...executionRecord(started, loaded), ownerId: input.ownerId }, started] as const
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
    state: RuntimeState,
  ) => Effect.Effect<
    readonly [ExecutionRecord, RuntimeState],
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim | StaleSessionClaim,
    PreparedObservation
  >
  (
    state: RuntimeState,
    input: ExecutionClaim,
  ): Effect.Effect<
    readonly [ExecutionRecord, RuntimeState],
    RunNotFound | RunTerminal | RuntimeUnavailable | StaleClaim | StaleSessionClaim,
    PreparedObservation
  >
} = Function.dual(2, (state: RuntimeState, input: ExecutionClaim) =>
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
  ): (
    state: RuntimeState,
  ) => Effect.Effect<RuntimeState, RunNotFound | RuntimeUnavailable | StaleClaim, PreparedObservation>
  (
    state: RuntimeState,
    input: ExecutionClaim & {
      readonly checkpoint?: ExecutionRecord["checkpoint"]
      readonly suspension?: ExecutionRecord["suspension"]
    },
  ): Effect.Effect<RuntimeState, RunNotFound | RuntimeUnavailable | StaleClaim, PreparedObservation>
} = Function.dual(
  2,
  (
    state: RuntimeState,
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
      if (input.checkpoint === undefined || !("driverVersion" in input.checkpoint)) return { ...state, runs }
      if (!Schema.is(Schema.Struct({ components: Schema.Unknown }))(input.checkpoint.state)) return { ...state, runs }
      const checkpoint = yield* Schema.decodeUnknownEffect(
        Schema.Struct({
          sessionId: Schema.String,
          components: Schema.Array(ComponentCheckpoint),
        }),
      )(input.checkpoint.state).pipe(
        Effect.mapError(() => RuntimeUnavailable.make({ message: "Invalid component checkpoint" })),
      )
      const components = checkpoint.components.filter((component) => component.descriptor.scope === "session")
      if (components.length === 0) return { ...state, runs }
      yield* requireExecutionClaim(state, input).pipe(
        Effect.mapError(() => RuntimeUnavailable.make({ message: "Session component writer claim is stale" })),
      )
      if (
        checkpoint.sessionId !== run.message.sessionId ||
        input.session?.sessionId !== run.message.sessionId ||
        (run.parentRunId !== undefined && state.runs.get(run.parentRunId)?.message.sessionId === run.message.sessionId)
      ) {
        return yield* RuntimeUnavailable.make({ message: "Session component ownership mismatch" })
      }
      const session = state.sessions.get(run.message.sessionId)!
      return {
        ...state,
        runs,
        sessions: new Map(state.sessions).set(run.message.sessionId, { ...session, components }),
      }
    }),
)
