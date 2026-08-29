import { Effect, Function } from "effect"
import { RuntimeUnavailable } from "../errors.js"
import { laneKey, type MemoryState, type StoredRun } from "./state.js"
import { appendLifecycle, attemptStartedEvent } from "./append.js"

interface EnqueueLaneResult {
  readonly state: MemoryState
  readonly acceptedSequence: number
  readonly isHead: boolean
}

export const enqueueLane: {
  (sessionId: string, runId: string): (state: MemoryState) => EnqueueLaneResult
  (state: MemoryState, sessionId: string, runId: string): EnqueueLaneResult
} = Function.dual(3, (state: MemoryState, sessionId: string, runId: string): EnqueueLaneResult => {
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
  (sessionId: string, runId: string): (state: MemoryState) => MemoryState
  (state: MemoryState, sessionId: string, runId: string): MemoryState
} = Function.dual(3, (state: MemoryState, sessionId: string, runId: string): MemoryState => {
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
  (sessionId: string): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (state: MemoryState, sessionId: string): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, sessionId: string) =>
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
    return next
  }),
)

export const afterTerminal: {
  (run: StoredRun): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (state: MemoryState, run: StoredRun): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, run: StoredRun) =>
  Effect.gen(function* () {
    const without = removeFromLane(state, run.message.sessionId, run.runId)
    return yield* promoteHead(without, run.message.sessionId)
  }),
)
