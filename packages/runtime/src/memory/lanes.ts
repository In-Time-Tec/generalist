import { Effect } from "effect"
import type { Address } from "../address.js"
import { RuntimeUnavailable } from "../errors.js"
import type { MemoryState, StoredRun } from "./state.js"
import { laneKey } from "./state.js"
import { appendLifecycle, makeAttemptStarted } from "./append.js"

export const enqueueLane = (
  state: MemoryState,
  address: Address,
  sessionId: string,
  runId: string,
): { readonly state: MemoryState; readonly acceptedSequence: number; readonly isHead: boolean } => {
  const key = laneKey(address, sessionId)
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
}

export const removeFromLane = (state: MemoryState, address: Address, sessionId: string, runId: string): MemoryState => {
  const key = laneKey(address, sessionId)
  const current = state.lanes.get(key)
  if (current === undefined) return state
  const queue = current.queue.filter((id) => id !== runId)
  const lanes = new Map(state.lanes)
  if (queue.length === 0) lanes.delete(key)
  else lanes.set(key, { ...current, queue })
  return { ...state, lanes }
}

export const promoteHead = (
  state: MemoryState,
  address: Address,
  sessionId: string,
): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const key = laneKey(address, sessionId)
    const lane = state.lanes.get(key)
    if (lane === undefined || lane.queue.length === 0) return state
    const headId = lane.queue[0]
    if (headId === undefined) return state
    const head = state.runs.get(headId)
    if (head === undefined || head.status !== "queued") return state
    if (head.cancellationRequested) return state
    const attempt = head.attempt + 1
    const [, next] = yield* appendLifecycle(state, headId, makeAttemptStarted(attempt), "running")
    return next
  })

export const afterTerminal = (state: MemoryState, run: StoredRun): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const without = removeFromLane(state, run.address, run.message.sessionId, run.runId)
    return yield* promoteHead(without, run.address, run.message.sessionId)
  })
