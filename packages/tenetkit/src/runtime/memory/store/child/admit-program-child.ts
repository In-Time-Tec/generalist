import { Effect, Function } from "effect"
import {
  ChildDepthExceeded,
  ChildLimitExceeded,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../../../errors.js"
import { decodePinned, equals } from "../../../executable/manifest.js"
import { narrow } from "../../../executable/registration.js"
import type { RunReceipt } from "../../../run.js"
import type { AdmitProgramChildInput } from "../../../run/store.js"
import { appendLifecycle, acceptedEvent, childLinkedEvent } from "../../append.js"
import { childDigest } from "../../digest.js"
import { idempotencyKey, type MemoryState, type StoredRun } from "../../state.js"
import { readinessForAdmission } from "./capacity.js"

type AdmitProgramChildResult = Effect.Effect<
  readonly [RunReceipt, MemoryState],
  | RunNotFound
  | RunTerminal
  | IdempotencyConflict
  | RunIdConflict
  | RuntimeUnavailable
  | ChildDepthExceeded
  | ChildLimitExceeded
>

export const admitProgramChild: {
  (input: AdmitProgramChildInput): (state: MemoryState) => AdmitProgramChildResult
  (state: MemoryState, input: AdmitProgramChildInput): AdmitProgramChildResult
} = Function.dual(2, (state: MemoryState, input: AdmitProgramChildInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const parent = state.runs.get(input.runId)
    if (parent === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (parent.status === "succeeded" || parent.status === "failed" || parent.status === "cancelled") {
      return yield* RunTerminal.make({ runId: parent.runId, status: parent.status })
    }
    const executable = yield* Effect.try({
      try: () => decodePinned({ ref: input.executableRef, manifest: input.executableManifest }),
      catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
    })
    const registrations = yield* narrow(executable, input.registrations).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
    )
    const digest = childDigest(input.message, input.executableRef)
    const key = idempotencyKey(input.message.to, input.message.sessionId, input.message.idempotencyKey)
    const existing = state.idempotency.get(key)
    if (existing !== undefined) {
      if (existing.receipt.runId !== input.childRunId) {
        return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: existing.receipt.runId })
      }
      if (existing.digest !== digest || !equals(existing.executable, executable)) {
        return yield* IdempotencyConflict.make({
          address: input.message.to,
          sessionId: input.message.sessionId,
          idempotencyKey: input.message.idempotencyKey,
          existingRunId: existing.receipt.runId,
        })
      }
      return [
        {
          runId: existing.receipt.runId,
          messageId: existing.receipt.messageId,
          acceptedSequence: existing.receipt.acceptedSequence,
          duplicate: true,
        },
        state,
      ] as const
    }
    if (state.runs.has(input.childRunId)) {
      return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: input.childRunId })
    }
    const depth = parent.depth + 1
    if (depth > parent.treePolicy.maxDepth) {
      return yield* ChildDepthExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: depth,
        current: parent.depth,
        limit: parent.treePolicy.maxDepth,
      })
    }
    if (parent.treePolicy.maxSubagents === 0) {
      return yield* ChildLimitExceeded.make({
        parentRunId: parent.runId,
        rootRunId: parent.rootRunId,
        parentDepth: parent.depth,
        depth,
        requested: 1,
        current: 0,
        limit: parent.treePolicy.maxSubagents,
      })
    }
    const childReadiness = readinessForAdmission(state, parent)
    const child: StoredRun = {
      runId: input.childRunId,
      status: "queued",
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
      address: input.message.to,
      message: input.message,
      rootRunId: parent.rootRunId,
      depth,
      treePolicy: parent.treePolicy,
      parentRunId: parent.runId,
      childReadiness,
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
      registrations,
    }
    const runs = new Map(state.runs)
    runs.set(parent.runId, { ...parent, children: [...parent.children, child.runId] })
    runs.set(child.runId, child)
    let next: MemoryState = { ...state, runs }
    const [, linked] = yield* appendLifecycle(
      next,
      parent.runId,
      childLinkedEvent(
        child.runId,
        input.invocationId,
        input.executableRef.active,
        input.message.prompt,
        parent.depth + 1,
        { readiness: childReadiness },
      ),
    )
    next = linked
    const [, accepted] = yield* appendLifecycle(
      next,
      child.runId,
      acceptedEvent(input.message.to, input.message.id),
      "queued",
    )
    next = accepted
    const receipt = { runId: child.runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
    const idempotency = new Map(next.idempotency)
    idempotency.set(key, { digest, executable, receipt })
    return [receipt, { ...next, idempotency }] as const
  }),
)
