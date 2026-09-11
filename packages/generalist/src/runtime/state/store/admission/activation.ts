import type { PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import { RunNotFound, RuntimeUnavailable } from "../../../errors.js"
import type { RunActivation } from "../../../run/activation.js"
import type { RunInspection } from "../../../run.js"
import { appendLifecycle, attemptStartedEvent } from "../../append.js"
import type { RuntimeState, StoredRun } from "../../projection.js"
import { toInspection } from "../events.js"

type ActivateResult = Effect.Effect<
  readonly [RunInspection, RuntimeState],
  RunNotFound | RuntimeUnavailable,
  PreparedObservation
>

export const requireConversationalSlot = ({
  state,
  run,
}: {
  readonly state: RuntimeState
  readonly run: StoredRun
}) => {
  const activeRunId = state.hostSessions.get(run.message.sessionId)?.session.activeRunId
  if (run.parentRunId !== undefined || activeRunId === undefined || activeRunId === run.runId) return Effect.void
  const executable = run.executableManifest.entries.find((entry) => entry.pin === run.executableRef.active)
  return executable?._tag !== "Agent"
    ? Effect.void
    : Effect.fail(
        RuntimeUnavailable.make({
          message: `Session ${run.message.sessionId} already has active conversational Run ${activeRunId}`,
        }),
      )
}

/** Shared with rewind, which must enforce the same precondition inside its own transition. */
export const requireNoInitialChildren = (run: StoredRun) =>
  run.children.length > 0
    ? Effect.fail(RuntimeUnavailable.make({ message: `run ${run.runId} has initial children` }))
    : Effect.void

export const activationOf = (run: StoredRun): RunActivation => {
  let intent: RunActivation["intent"] = "inactive"
  if (run.status === "cancelling") intent = "cancel"
  else if (
    run.ownerId === undefined &&
    (run.status === "running" ||
      (run.status === "queued" && run.parentRunId !== undefined && run.childReadiness === "ready"))
  )
    intent = "execute"
  return intent === "inactive"
    ? { runId: run.runId, intent }
    : { runId: run.runId, intent, attemptFence: run.attemptFence, runStatus: run.status }
}

export const activateRoot: {
  (runId: string): (state: RuntimeState) => ActivateResult
  (state: RuntimeState, runId: string): ActivateResult
} = Function.dual(2, (state: RuntimeState, runId: string) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const run = state.runs.get(runId)
    if (run === undefined) return yield* RunNotFound.make({ runId })
    if (run.parentRunId !== undefined) {
      return yield* RuntimeUnavailable.make({ message: `run ${runId} is not a root` })
    }
    if (run.status !== "queued" || run.cancellationRequested) return [toInspection(state, run), state] as const
    yield* requireNoInitialChildren(run)
    const session = state.hostSessions.get(run.message.sessionId)
    const executable = run.executableManifest.entries.find((entry) => entry.pin === run.executableRef.active)
    yield* requireConversationalSlot({ state, run })
    const [, activated] = yield* appendLifecycle(state, runId, attemptStartedEvent(run.attempt + 1), "running")
    if (session === undefined || executable?._tag !== "Agent")
      return [toInspection(activated, activated.runs.get(runId)!), activated] as const
    const hostSessions = new Map(activated.hostSessions)
    const current = hostSessions.get(run.message.sessionId)!
    hostSessions.set(run.message.sessionId, { ...current, session: { ...current.session, activeRunId: runId } })
    const next = { ...activated, hostSessions }
    return [toInspection(next, next.runs.get(runId)!), next] as const
  }),
)
