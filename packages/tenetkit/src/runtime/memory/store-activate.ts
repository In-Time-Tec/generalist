import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../errors.js"
import type { RunActivation } from "../run-activation.js"
import type { RunInspection } from "../run.js"
import { appendLifecycle, makeAttemptStarted } from "./append.js"
import type { MemoryState, StoredRun } from "./state.js"
import { toInspection } from "./store-events.js"

type ActivateResult = Effect.Effect<readonly [RunInspection, MemoryState], RunNotFound | RuntimeUnavailable>

export const activationOf = (run: StoredRun): RunActivation => {
  const intent: RunActivation["intent"] =
    run.status === "cancelling"
      ? "cancel"
      : run.ownerId === undefined &&
          (run.status === "running" ||
            (run.status === "queued" && run.parentRunId !== undefined && run.childReadiness === "ready"))
        ? "execute"
        : "inactive"
  return intent === "inactive"
    ? { runId: run.runId, intent }
    : { runId: run.runId, intent, attemptFence: run.attemptFence, runStatus: run.status }
}

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
