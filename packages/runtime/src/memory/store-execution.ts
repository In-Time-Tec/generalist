import { Effect } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable } from "../errors.js"
import { isTerminal } from "../run.js"
import type { ExecutionClaim, ExecutionRecord } from "../run-store.js"
import { StaleClaim } from "../sql/errors.js"
import type { MemoryState } from "./state.js"

const requireRun = (state: MemoryState, runId: string) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const executionRecord = (
  run: MemoryState["runs"] extends ReadonlyMap<string, infer R> ? R : never,
): ExecutionRecord => ({
  runId: run.runId,
  message: run.message,
  agent: run.agent,
  attempt: run.attempt,
  attemptFence: run.attemptFence,
  ...(run.checkpoint === undefined ? {} : { checkpoint: run.checkpoint }),
  ...(run.suspension === undefined ? {} : { suspension: run.suspension }),
  ...(run.wait?.resolution === undefined ? {} : { resolution: run.wait.resolution }),
  ...(run.transcript === undefined ? {} : { transcript: run.transcript }),
  ...(run.continuation === undefined ? {} : { continuation: run.continuation }),
})

export const loadExecution = (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, runId)
    return executionRecord(run)
  })

export const requireExecutionClaim = (state: MemoryState, input: ExecutionClaim) => {
  const run = state.runs.get(input.runId)
  return run !== undefined && run.ownerId === input.ownerId && run.attemptFence === input.attemptFence
    ? Effect.void
    : StaleClaim.make({ runId: input.runId, workerId: input.ownerId, attemptFence: input.attemptFence })
}

export const claimExecution = (
  state: MemoryState,
  input: { readonly runId: string; readonly ownerId: string },
): Effect.Effect<
  readonly [ExecutionRecord & ExecutionClaim, MemoryState],
  RunNotFound | RunTerminal | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status)) return yield* RunTerminal.make({ runId: run.runId, status: run.status })
    if (run.status === "waiting" || run.status === "queued") {
      return yield* RuntimeUnavailable.make({ message: `run ${run.runId} is ${run.status}` })
    }
    const claimed = {
      ...run,
      status: "running" as const,
      ownerId: input.ownerId,
      attemptFence: run.attemptFence + 1,
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, claimed)
    return [
      { ...executionRecord(claimed), ownerId: input.ownerId },
      { ...state, runs },
    ] as const
  })

export const saveExecution = (
  state: MemoryState,
  input: ExecutionClaim & {
    readonly checkpoint?: ExecutionRecord["checkpoint"]
    readonly suspension?: ExecutionRecord["suspension"]
    readonly transcript?: ExecutionRecord["transcript"]
  },
): Effect.Effect<MemoryState, RunNotFound | RuntimeUnavailable | StaleClaim> =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (run.ownerId !== input.ownerId || run.attemptFence !== input.attemptFence) {
      return yield* StaleClaim.make({
        runId: input.runId,
        workerId: input.ownerId,
        attemptFence: input.attemptFence,
      })
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, {
      ...run,
      ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
      ...(input.suspension === undefined ? {} : { suspension: input.suspension }),
      ...(input.transcript === undefined ? {} : { transcript: input.transcript }),
    })
    return { ...state, runs }
  })
