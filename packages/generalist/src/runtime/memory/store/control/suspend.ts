import { DateTime, Effect, Equal, Function, Option } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../../../errors.js"
import type { RunWait } from "../../../run/wait.js"
import { checkpointRef } from "../../../executable/manifest-internal.js"
import { appendLifecycle, rejectIfTerminal, resumedEvent, waitingEvent } from "../../append.js"
import { waitMapKey, type MemoryState, type StoredRun } from "../../state.js"
import { groupWaitsFromSuspension, resultFromInspection } from "../../../child/group.js"
import { reconcileChildWait } from "../child/settlement.js"
import { closeWait } from "./wait.js"

type SuspendInput = import("../../../run/store.js").ExecutionClaim & {
  readonly waits: ReadonlyArray<RunWait>
  readonly suspension: import("../../../execution/state.js").ExecutionSuspension
  readonly checkpoint?: import("../../../execution/state.js").ExecutionCheckpoint
  readonly continuation?: import("../../../run/steering.js").ExecutionContinuation | null
}
type SuspendResult = Effect.Effect<MemoryState, RunNotFound | RunTerminal | RuntimeUnavailable>

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const suspensionTokens = (suspension: SuspendInput["suspension"]): ReadonlyArray<string> => {
  if (suspension._tag === "generalist/core/AgentSuspended") return suspension.waits.map((wait) => wait.token)
  if (suspension._tag === "generalist/core/ProgramSuspended") {
    return suspension.token === undefined ? [] : [suspension.token]
  }
  return []
}

const suspendedRuns = (
  state: MemoryState,
  run: StoredRun,
  executableRef: StoredRun["executableRef"],
  input: SuspendInput,
) => {
  const runs = new Map(state.runs)
  const { checkpoint: _previousCheckpoint, ...withoutCheckpoint } = run
  let updated: StoredRun = { ...withoutCheckpoint, executableRef, suspension: input.suspension }
  if (input.checkpoint !== undefined) updated = { ...updated, checkpoint: input.checkpoint }
  if (input.continuation !== undefined && input.continuation !== null) {
    updated = { ...updated, continuation: input.continuation }
  }
  if (input.continuation === null) {
    const { continuation: _previousContinuation, ...withoutContinuation } = updated
    runs.set(run.runId, withoutContinuation)
  } else runs.set(run.runId, updated)
  return runs
}

const insertWaits = (state: MemoryState, runId: string, requestedWaits: ReadonlyArray<RunWait>) =>
  Effect.gen(function* () {
    const waits = new Map(state.waits)
    const inserted: Array<RunWait> = []
    const identities = new Set<string>()
    for (const requested of requestedWaits) {
      if (requested.status !== "open" || identities.has(requested.waitId)) {
        return yield* RuntimeUnavailable.make({ message: `Invalid wait batch for Run ${runId}` })
      }
      identities.add(requested.waitId)
      const prior = waits.get(waitMapKey(runId, requested.waitId))
      if (prior === undefined) {
        waits.set(waitMapKey(runId, requested.waitId), requested)
        inserted.push(requested)
      } else if (prior.status !== "open" || !Equal.equals(prior.reason, requested.reason)) {
        return yield* RuntimeUnavailable.make({ message: `Wait ${requested.waitId} cannot be reopened or changed` })
      }
    }
    return { state: { ...state, waits }, inserted }
  })

const appendWaits = (state: MemoryState, runId: string, inserted: ReadonlyArray<RunWait>) =>
  Effect.gen(function* () {
    let next = state
    for (const wait of inserted) {
      ;[, next] = yield* appendLifecycle(next, runId, waitingEvent(wait), "waiting")
    }
    if (inserted.length === 0) {
      const runs = new Map(next.runs)
      runs.set(runId, { ...runs.get(runId)!, status: "waiting" })
      next = { ...next, runs }
    }
    const runs = new Map(next.runs)
    const { ownerId: _previousOwnerId, ...waiting } = runs.get(runId)!
    runs.set(runId, waiting)
    return { ...next, runs }
  })

const reconcileChildren = (state: MemoryState, runId: string, tokens: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    let reconciled = state
    for (const token of tokens) {
      const child = reconciled.runs.get(token)
      const terminalEvent = child?.events.find(
        (event) => event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled",
      )
      if (child !== undefined && terminalEvent !== undefined) {
        reconciled = yield* reconcileChildWait(reconciled, reconciled.runs.get(runId)!, child, terminalEvent)
      }
    }
    return reconciled
  })

const reconcileGroups = (state: MemoryState, runId: string, suspension: SuspendInput["suspension"]) =>
  Effect.gen(function* () {
    let reconciled = state
    for (const owned of groupWaitsFromSuspension(suspension)) {
      const group = reconciled.fanOuts.get(owned.groupId)
      if (group === undefined || group.parentRunId !== runId || group.status === "running") continue
      const resolution = {
        _tag: "Signal" as const,
        name: owned.waitId,
        payload: resultFromInspection(group),
      }
      const transitioned = closeWait(reconciled, {
        runId,
        waitId: owned.waitId,
        status: "signaled",
        resolution,
        closedAt: yield* DateTime.now.pipe(Effect.map(DateTime.formatIso)),
      })
      if (transitioned.affected !== 1) continue
      ;[, reconciled] = yield* appendLifecycle(
        transitioned.state,
        runId,
        resumedEvent(owned.waitId, resolution),
        "running",
      )
    }
    return reconciled
  })

export const suspend: {
  (input: SuspendInput): (state: MemoryState) => SuspendResult
  (state: MemoryState, input: SuspendInput): SuspendResult
} = Function.dual(2, (state: MemoryState, input: SuspendInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const executableRef = yield* Effect.try({
      try: () => checkpointRef(run.executableRef, run.executableManifest, input.checkpoint),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const withRun = { ...state, runs: suspendedRuns(state, run, executableRef, input) }
    const inserted = yield* insertWaits(withRun, run.runId, input.waits)
    const waiting = yield* appendWaits(inserted.state, run.runId, inserted.inserted)
    const withChildren = yield* reconcileChildren(waiting, run.runId, suspensionTokens(input.suspension))
    return yield* reconcileGroups(withChildren, run.runId, input.suspension)
  }),
)
