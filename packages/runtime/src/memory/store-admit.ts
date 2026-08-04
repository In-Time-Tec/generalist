import { Effect } from "effect"
import type { AgentRef } from "../agent-ref.js"
import {
  AgentNotRegistered,
  AgentVersionUnavailable,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RuntimeUnavailable,
} from "../errors.js"
import type { Message } from "../message.js"
import type { RunReceipt } from "../run.js"
import type { AdmitSendInput } from "../run-store.js"
import type { SpawnInput } from "../runtime.js"
import { appendLifecycle, makeAccepted, makeAttemptStarted, makeChildLinked } from "./append.js"
import { messageDigest } from "./digest.js"
import { enqueueLane, promoteHead } from "./lanes.js"
import { agentKey, idempotencyKey, type MemoryState, type StoredRun } from "./state.js"

const newRunId = (state: MemoryState): readonly [string, MemoryState] => {
  const runId = `run_${state.nextRunCounter}`
  return [runId, { ...state, nextRunCounter: state.nextRunCounter + 1 }]
}

const requireAgent = (state: MemoryState, agent: AgentRef): Effect.Effect<void, AgentNotRegistered> =>
  state.agentRefs.has(agentKey(agent)) ? Effect.void : Effect.fail(AgentNotRegistered.make({ agent }))

export const admitSend = (
  state: MemoryState,
  input: AdmitSendInput,
): Effect.Effect<
  readonly [RunReceipt, MemoryState],
  IdempotencyConflict | RunIdConflict | AgentNotRegistered | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    if (state.closed) {
      return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    }
    yield* requireAgent(state, input.agent)
    const digest = messageDigest(input.message)
    const key = idempotencyKey(input.message.to, input.message.sessionId, input.message.idempotencyKey)
    const existing = state.idempotency.get(key)
    if (existing !== undefined) {
      if (input.runId !== undefined && input.runId !== existing.receipt.runId) {
        return yield* RunIdConflict.make({ runId: input.runId, existingRunId: existing.receipt.runId })
      }
      if (existing.digest !== digest) {
        return yield* IdempotencyConflict.make({
          address: input.message.to,
          sessionId: input.message.sessionId,
          idempotencyKey: input.message.idempotencyKey,
          existingRunId: existing.receipt.runId,
        })
      }
      return [{ ...existing.receipt, duplicate: true }, state] as const
    }

    const requestedRun = input.runId === undefined ? undefined : state.runs.get(input.runId)
    if (requestedRun !== undefined) {
      return yield* RunIdConflict.make({ runId: input.runId!, existingRunId: requestedRun.runId })
    }
    const [generatedRunId, withId] = input.runId === undefined ? newRunId(state) : ([input.runId, state] as const)
    const runId = generatedRunId
    const run: StoredRun = {
      runId,
      status: "queued",
      agent: input.agent,
      address: input.message.to,
      message: input.message,
      rootRunId: runId,
      respondedWaitIds: new Set(),
      lastSequence: -1,
      attempt: 0,
      attemptFence: 0,
      cancellationRequested: false,
      children: [],
      events: [],
      subscribers: new Map(),
      steering: [],
    }
    const runs = new Map(withId.runs)
    runs.set(runId, run)
    let next: MemoryState = { ...withId, runs }
    const enqueued = enqueueLane(next, input.message.to, input.message.sessionId, runId)
    next = enqueued.state
    const [, acceptedState] = yield* appendLifecycle(
      next,
      runId,
      makeAccepted(input.message.to, input.message.id),
      "queued",
    )
    next = acceptedState
    if (enqueued.isHead) {
      next = yield* promoteHead(next, input.message.to, input.message.sessionId)
    }
    const receipt: RunReceipt = {
      runId,
      messageId: input.message.id,
      acceptedSequence: enqueued.acceptedSequence,
      duplicate: false,
    }
    const idempotency = new Map(next.idempotency)
    idempotency.set(key, { digest, receipt })
    return [receipt, { ...next, idempotency }] as const
  })

export const admitSpawn = (
  state: MemoryState,
  input: SpawnInput & { readonly message: Message; readonly agent: AgentRef; readonly parentRunId: string },
): Effect.Effect<
  readonly [RunReceipt, MemoryState],
  RunNotFound | AgentVersionUnavailable | AgentNotRegistered | IdempotencyConflict | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    if (state.closed) {
      return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    }
    const parent = state.runs.get(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    if (!state.agentRefs.has(agentKey(input.agent))) {
      return yield* AgentVersionUnavailable.make({ agent: input.agent })
    }

    const sessionId = input.message.sessionId
    const digest = messageDigest(input.message)
    const key = idempotencyKey(input.message.to, sessionId, input.message.idempotencyKey)
    const existing = state.idempotency.get(key)
    if (existing !== undefined) {
      if (existing.digest !== digest) {
        return yield* IdempotencyConflict.make({
          address: input.message.to,
          sessionId,
          idempotencyKey: input.message.idempotencyKey,
          existingRunId: existing.receipt.runId,
        })
      }
      return [{ ...existing.receipt, duplicate: true }, state] as const
    }

    const [runId, withId] = newRunId(state)
    const child: StoredRun = {
      runId,
      status: "queued",
      agent: input.agent,
      address: input.message.to,
      message: input.message,
      rootRunId: parent.rootRunId,
      parentRunId: parent.runId,
      invocationId: input.invocationId,
      respondedWaitIds: new Set(),
      lastSequence: -1,
      attempt: 0,
      attemptFence: 0,
      cancellationRequested: false,
      children: [],
      events: [],
      subscribers: new Map(),
      steering: [],
    }
    const runs = new Map(withId.runs)
    const parentUpdated: StoredRun = { ...parent, children: [...parent.children, runId] }
    runs.set(parent.runId, parentUpdated)
    runs.set(runId, child)
    let next: MemoryState = { ...withId, runs }

    const [, linked] = yield* appendLifecycle(next, parent.runId, makeChildLinked(runId, input.invocationId))
    next = linked

    const [, accepted] = yield* appendLifecycle(next, runId, makeAccepted(input.message.to, input.message.id), "queued")
    next = accepted
    const [, started] = yield* appendLifecycle(next, runId, makeAttemptStarted(1), "running")
    next = started

    const receipt: RunReceipt = {
      runId,
      messageId: input.message.id,
      acceptedSequence: 0,
      duplicate: false,
    }
    const idempotency = new Map(next.idempotency)
    idempotency.set(key, { digest, receipt })
    return [receipt, { ...next, idempotency }] as const
  })

export { requireAgent }
