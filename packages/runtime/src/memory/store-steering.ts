import { Effect, Option } from "effect"
import { RunNotFound, RunTerminal, RuntimeUnavailable, SteeringConflict } from "../errors.js"
import type { AdmitSteeringInput, ExecutionClaim } from "../run-store.js"
import { rejectIfTerminal } from "./append.js"
import type { MemoryState, StoredRun } from "./state.js"

const requireRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

export const admitSteering = (state: MemoryState, input: AdmitSteeringInput) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const terminal = rejectIfTerminal(run)
    if (Option.isSome(terminal)) return yield* RunTerminal.make({ runId: run.runId, status: terminal.value })
    const prior = run.steering.find((entry) => entry.idempotencyKey === input.idempotencyKey)
    if (prior !== undefined) {
      if (prior.digest === input.digest) return state
      return yield* SteeringConflict.make({ runId: input.runId, idempotencyKey: input.idempotencyKey })
    }
    const runs = new Map(state.runs)
    runs.set(run.runId, {
      ...run,
      steering: [
        ...run.steering,
        {
          entryId: `steer_${state.nextSteeringCounter}`,
          runId: run.runId,
          sequence: run.steering.length,
          idempotencyKey: input.idempotencyKey,
          digest: input.digest,
          prompt: input.prompt,
        },
      ],
    })
    return { ...state, nextSteeringCounter: state.nextSteeringCounter + 1, runs }
  })

export const readSteering = (state: MemoryState, input: ExecutionClaim) =>
  Effect.map(requireRun(state, input.runId), (run) =>
    run.steering.filter((entry) => entry.consumedOperationId === undefined),
  )
