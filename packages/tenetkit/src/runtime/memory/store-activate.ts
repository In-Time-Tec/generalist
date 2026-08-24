import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../errors.js"
import type { RunInspection } from "../run.js"
import { appendLifecycle, makeAttemptStarted } from "./append.js"
import type { MemoryState } from "./state.js"
import { toInspection } from "./store-events.js"

type ActivateResult = Effect.Effect<readonly [RunInspection, MemoryState], RunNotFound | RuntimeUnavailable>

export const activateRoot: {
  (runId: string): (state: MemoryState) => ActivateResult
  (state: MemoryState, runId: string): ActivateResult
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const run = state.runs.get(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    if (run.parentRunId !== undefined) {
      return yield* RuntimeUnavailable.make({ message: `run ${runId} is not a root` })
    }
    if (run.status !== "queued" || run.cancellationRequested) return [toInspection(run), state] as const
    if (run.children.length > 0) {
      return yield* RuntimeUnavailable.make({ message: `run ${runId} has initial children` })
    }
    const [, activated] = yield* appendLifecycle(state, runId, makeAttemptStarted(run.attempt + 1), "running")
    return [toInspection(activated.runs.get(runId)!), activated] as const
  }),
)
