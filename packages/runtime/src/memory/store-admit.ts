import { Effect } from "effect"
import {
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  ChildSelectionMissing,
} from "../errors.js"
import { decodePinned, equals, resolveChild } from "../executable-manifest.js"
import type { RunReceipt } from "../run.js"
import type { AdmitSendInput } from "../run-store.js"
import type { Message } from "../message.js"
import type { SpawnInput } from "../runtime.js"
import { appendLifecycle, makeAccepted, makeAttemptStarted, makeChildLinked } from "./append.js"
import { childDigest, messageDigest } from "./digest.js"
import { enqueueLane, promoteHead } from "./lanes.js"
import { idempotencyKey, type MemoryState, type StoredRun } from "./state.js"

const newRunId = (state: MemoryState): readonly [string, MemoryState] => {
  const runId = `run_${state.nextRunCounter}`
  return [runId, { ...state, nextRunCounter: state.nextRunCounter + 1 }]
}

export const admitSend = (
  state: MemoryState,
  input: AdmitSendInput,
): Effect.Effect<readonly [RunReceipt, MemoryState], IdempotencyConflict | RunIdConflict | RuntimeUnavailable> =>
  Effect.gen(function* () {
    if (state.closed) {
      return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    }
    const digest = messageDigest(input.message)
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const key = idempotencyKey(input.message.to, input.message.sessionId, input.message.idempotencyKey)
    const existing = state.idempotency.get(key)
    if (existing !== undefined) {
      if (input.runId !== undefined && input.runId !== existing.receipt.runId) {
        return yield* RunIdConflict.make({ runId: input.runId, existingRunId: existing.receipt.runId })
      }
      if (existing.digest !== digest || !equals(existing.executable, executable)) {
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
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
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
    const treeRoots = new Map(withId.treeRoots)
    treeRoots.set(runId, { earliestPosition: 0, lastPosition: -1, events: [] })
    let next: MemoryState = { ...withId, runs, treeRoots }
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
    idempotency.set(key, { digest, executable, receipt })
    return [receipt, { ...next, idempotency }] as const
  })

export const admitSpawn = (
  state: MemoryState,
  input: SpawnInput & { readonly message: Message; readonly parentRunId: string },
): Effect.Effect<
  readonly [RunReceipt, MemoryState],
  RunNotFound | RunTerminal | ChildSelectionMissing | IdempotencyConflict | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    if (state.closed) {
      return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    }
    const parent = state.runs.get(input.parentRunId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.parentRunId })
    if (parent.status === "succeeded" || parent.status === "failed" || parent.status === "cancelled") {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const executableRef = resolveChild(parent.executableRef, parent.executableManifest, input.selection)
    if (executableRef === undefined) {
      return yield* ChildSelectionMissing.make({ parentRunId: parent.runId, selection: input.selection })
    }

    const sessionId = input.message.sessionId
    const digest = childDigest(input.message, executableRef)
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: executableRef, manifest: parent.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const key = idempotencyKey(input.message.to, sessionId, input.message.idempotencyKey)
    const existing = state.idempotency.get(key)
    if (existing !== undefined) {
      if (existing.digest !== digest || !equals(existing.executable, executable)) {
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
      executableRef,
      executableManifest: parent.executableManifest,
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
    idempotency.set(key, { digest, executable, receipt })
    return [receipt, { ...next, idempotency }] as const
  })
