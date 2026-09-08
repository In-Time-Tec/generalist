import type { PreparedObservation } from "../../observation.js"
import { Effect, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import { laneKey, type RuntimeState } from "../../projection.js"
import { appendLifecycle, attemptStartedEvent } from "../../append.js"

interface EnqueueLaneResult {
  readonly state: RuntimeState
  readonly acceptedSequence: number
  readonly isHead: boolean
}

export const enqueueLane: {
  (sessionId: string, runId: string): (state: RuntimeState) => EnqueueLaneResult
  (state: RuntimeState, sessionId: string, runId: string): EnqueueLaneResult
} = Function.dual(3, (state: RuntimeState, sessionId: string, runId: string): EnqueueLaneResult => {
  const key = laneKey(sessionId)
  const current = state.lanes.get(key) ?? { queue: [], acceptedSequence: -1 }
  const acceptedSequence = current.acceptedSequence + 1
  const queue = [...current.queue, runId]
  const lanes = new Map(state.lanes)
  lanes.set(key, { queue, acceptedSequence })
  return {
    state: { ...state, lanes },
    acceptedSequence,
    isHead: queue[0] === runId,
  }
})

export const removeFromLane: {
  (sessionId: string, runId: string): (state: RuntimeState) => RuntimeState
  (state: RuntimeState, sessionId: string, runId: string): RuntimeState
} = Function.dual(3, (state: RuntimeState, sessionId: string, runId: string): RuntimeState => {
  const key = laneKey(sessionId)
  const current = state.lanes.get(key)
  if (current === undefined) return state
  const queue = current.queue.filter((id) => id !== runId)
  const lanes = new Map(state.lanes)
  if (queue.length === 0) lanes.delete(key)
  else lanes.set(key, { ...current, queue })
  return { ...state, lanes }
})

export const promoteHead: {
  (sessionId: string): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (state: RuntimeState, sessionId: string): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, sessionId: string) =>
  Effect.gen(function* () {
    const key = laneKey(sessionId)
    const lane = state.lanes.get(key)
    if (lane === undefined || lane.queue.length === 0) return state
    const headId = lane.queue[0]
    if (headId === undefined) return state
    const head = state.runs.get(headId)
    if (head === undefined || head.status !== "queued") return state
    if (head.cancellationRequested) return state
    const attempt = head.attempt + 1
    const [, next] = yield* appendLifecycle(state, headId, attemptStartedEvent(attempt), "running")
    const session = next.hostSessions.get(sessionId)
    const entry = head.executableManifest.entries.find((candidate) => candidate.pin === head.executableRef.active)
    if (session === undefined || entry?._tag !== "Agent") return next
    const hostSessions = new Map(next.hostSessions)
    hostSessions.set(sessionId, { ...session, session: { ...session.session, activeRunId: headId } })
    return { ...next, hostSessions }
  }),
)
