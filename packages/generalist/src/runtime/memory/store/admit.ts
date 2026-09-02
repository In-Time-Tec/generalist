import { Effect, Function, Schema } from "effect"
import {
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  ChildSelectionMissing,
  ExecutableRegistrationConflict,
  StartInvalid,
  FanOutConflict,
  FanOutInvalid,
  FanOutRemainderUnsupported,
  ChildDepthExceeded,
  ChildLimitExceeded,
  TreePolicyInvalid,
} from "../../errors.js"
import { decodePinned, equals, resolveChild } from "../../executable/manifest-internal.js"
import type { RunReceipt } from "../../run.js"
import type { AdmitSendInput, AdmitStartInput } from "../../run/store.js"
import { digest as registrationDigest, narrow } from "../../executable/registration.js"
import { make as makeMessage, type Message } from "../../messaging/message.js"
import type { SpawnInput, StartReceipt } from "../../service.js"
import { appendLifecycle, acceptedEvent, childLinkedEvent } from "../append.js"
import { childDigest, rootDigest, startDigest } from "../digest.js"
import { enqueueLane, promoteHead } from "../lanes.js"
import { idempotencyKey, laneKey, type MemoryState, type StoredRun } from "../state.js"
import { make as makeAddress } from "../../address.js"
import type { FanOutReceipt } from "../../child/fan-out.js"
import type { FanOutMemberOrigin } from "../../child/fan-out-internal.js"
import { admitFanOut } from "./fan-out/service.js"
import { normalize as normalizeTreePolicy } from "../../tree/policy.js"
import { readinessForAdmission } from "./child/capacity.js"
import { receiptAdmission } from "./admission/receipt.js"
import { budgetForEvents } from "../../execution/inspection.js"
import { childGrant, Exhausted } from "../../../core/durable/run-budget.js"

const { duplicateReceipt, fanOutAdmission, newRunId, startReceipt } = receiptAdmission

type ChildDetails = {
  readiness: import("../../child/readiness.js").ChildReadiness
  label?: string
  origin?: FanOutMemberOrigin
}
type ChildDigestInput = { parentRunId: string; invocationId: string; label?: string; origin?: FanOutMemberOrigin }

const addRegistrations = (state: MemoryState, registrations: AdmitSendInput["registrations"]) =>
  Effect.gen(function* () {
    const catalog = new Map(state.registrationCatalog)
    for (const registration of registrations) {
      const digest = registrationDigest(registration)
      const existing = catalog.get(registration.pin)
      if (existing !== undefined && existing.digest !== digest) {
        return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
      }
      catalog.set(registration.pin, { digest, value: registration })
    }
    return catalog
  })

const validateInitialChildren = (input: AdmitStartInput) =>
  Effect.gen(function* () {
    if (input.initialChildren.length > 64) {
      return yield* StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
    }
    const invocationIds = new Set<string>()
    const idempotencySources = new Set<string>()
    for (const child of input.initialChildren) {
      if (invocationIds.has(child.invocationId)) {
        return yield* StartInvalid.make({ message: `duplicate initial child invocationId: ${child.invocationId}` })
      }
      const source = `${child.sessionId}\0${child.idempotencyKey}`
      if (idempotencySources.has(source)) {
        return yield* StartInvalid.make({ message: "duplicate initial child sessionId/idempotencyKey" })
      }
      invocationIds.add(child.invocationId)
      idempotencySources.add(source)
    }
    const active = input.executableManifest.entries.find((entry) => entry.pin === input.executableRef.active)
    const missing = input.initialChildren.find(
      (child) =>
        active?._tag !== "Agent" ||
        resolveChild(input.executableRef, input.executableManifest, child.selection) === undefined,
    )
    if (missing !== undefined) {
      return yield* ChildSelectionMissing.make({ parentRunId: input.runId ?? "pending", selection: missing.selection })
    }
  })

const childDetails = (
  readiness: import("../../child/readiness.js").ChildReadiness,
  input: Pick<SpawnInput, "label" | "origin">,
): ChildDetails => {
  const details: ChildDetails = { readiness }
  if (input.label !== undefined) details.label = input.label
  if (input.origin !== undefined) details.origin = input.origin
  return details
}

type AdmitSendResult = Effect.Effect<
  readonly [RunReceipt, MemoryState],
  IdempotencyConflict | RunIdConflict | ExecutableRegistrationConflict | RuntimeUnavailable | TreePolicyInvalid
>

export const admitSend: {
  (input: AdmitSendInput, digestOverride?: string, promote?: boolean): (state: MemoryState) => AdmitSendResult
  (state: MemoryState, input: AdmitSendInput, digestOverride?: string, promote?: boolean): AdmitSendResult
} = Function.dual(
  (args) => "runs" in Object(args[0]),
  (state: MemoryState, input: AdmitSendInput, digestOverride?: string, promote: boolean = true) =>
    Effect.gen(function* () {
      if (state.closed) {
        return yield* RuntimeUnavailable.make({ message: "runtime store released" })
      }
      const treePolicy = yield* normalizeTreePolicy(input.treePolicy)
      const digest = digestOverride ?? rootDigest(input.message, treePolicy)
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
        return [duplicateReceipt(existing.receipt), state] as const
      }

      const requestedRun = input.runId === undefined ? undefined : state.runs.get(input.runId)
      if (requestedRun !== undefined) {
        return yield* RunIdConflict.make({ runId: requestedRun.runId, existingRunId: requestedRun.runId })
      }
      const registrationCatalog = yield* addRegistrations(state, input.registrations)
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
        depth: 0,
        treePolicy,
        lastSequence: -1,
        lastTurnCompletedSequence: -1,
        attempt: 0,
        attemptFence: 0,
        cancellationRequested: false,
        children: [],
        events: [],
        subscribers: new Map(),
        steering: [],
        registrations: input.registrations,
        checkpoints: new Map(),
      }
      const runs = new Map(withId.runs)
      runs.set(runId, run)
      const treeRoots = new Map(withId.treeRoots)
      treeRoots.set(runId, { earliestPosition: 0, lastPosition: -1, events: [], subscribers: new Map() })
      let next: MemoryState = { ...withId, runs, treeRoots }
      const enqueued = enqueueLane(next, input.message.sessionId, runId)
      next = enqueued.state
      const [, acceptedState] = yield* appendLifecycle(
        next,
        runId,
        acceptedEvent({ address: input.message.to, messageId: input.message.id, budget: input.budget }),
        "queued",
      )
      next = acceptedState
      if (enqueued.isHead && promote) {
        next = yield* promoteHead(next, input.message.sessionId)
      }
      const receipt: RunReceipt = {
        runId,
        messageId: input.message.id,
        acceptedSequence: enqueued.acceptedSequence,
        duplicate: false,
      }
      const idempotency = new Map(next.idempotency)
      idempotency.set(key, { digest, executable, receipt })
      return [receipt, { ...next, idempotency, registrationCatalog }] as const
    }),
)

type AdmitStartResult = Effect.Effect<
  readonly [StartReceipt, MemoryState],
  | IdempotencyConflict
  | RunIdConflict
  | ChildSelectionMissing
  | ExecutableRegistrationConflict
  | StartInvalid
  | FanOutConflict
  | FanOutInvalid
  | FanOutRemainderUnsupported
  | RuntimeUnavailable
  | TreePolicyInvalid
>

export const admitStart: {
  (input: AdmitStartInput, options?: { readonly activate?: boolean }): (state: MemoryState) => AdmitStartResult
  (state: MemoryState, input: AdmitStartInput, options?: { readonly activate?: boolean }): AdmitStartResult
} = Function.dual(
  (args) => "runs" in Object(args[0]),
  (state: MemoryState, input: AdmitStartInput, options?: { readonly activate?: boolean }) =>
    Effect.gen(function* () {
      const treePolicy = yield* normalizeTreePolicy(input.treePolicy)
      const normalizedInput = { ...input, treePolicy }
      yield* validateInitialChildren(input)
      if (input.initialFanOuts.length > 64) {
        return yield* StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
      }
      const catalog = yield* addRegistrations(state, input.registrations)
      const [receipt, admitted] = yield* admitSend(
        { ...state, registrationCatalog: catalog },
        normalizedInput,
        startDigest(normalizedInput),
        input.initialChildren.length === 0 && options?.activate !== false,
      )
      if (receipt.duplicate) {
        const root = admitted.runs.get(receipt.runId)
        if (root === undefined) {
          return yield* RuntimeUnavailable.make({ message: `admitted root ${receipt.runId} is missing` })
        }
        const childRunIds: Array<string> = []
        for (const child of input.initialChildren) {
          const runId = root.children.find((id) => {
            const run = admitted.runs.get(id)
            return (
              run?.invocationId === child.invocationId &&
              run.message.sessionId === child.sessionId &&
              run.message.idempotencyKey === child.idempotencyKey
            )
          })
          if (runId === undefined) {
            return yield* RuntimeUnavailable.make({ message: `initial child ${child.invocationId} is missing` })
          }
          childRunIds.push(runId)
        }
        const fanOuts: Array<FanOutReceipt> = []
        for (const fanOut of input.initialFanOuts) {
          const existing = [...admitted.fanOuts.values()].find(
            (entry) => entry.parentRunId === receipt.runId && entry.idempotencyKey === fanOut.idempotencyKey,
          )
          if (existing === undefined) {
            return yield* RuntimeUnavailable.make({ message: `initial fan-out ${fanOut.idempotencyKey} is missing` })
          }
          fanOuts.push({
            fanOutId: existing.fanOutId,
            parentRunId: receipt.runId,
            childRunIds: existing.members.map((member) => member.childRunId),
            duplicate: true,
          })
        }
        return [startReceipt(receipt, childRunIds, fanOuts), admitted] as const
      }
      const lanes = new Map(admitted.lanes)
      lanes.delete(laneKey(input.message.sessionId))
      let next: MemoryState = { ...admitted, lanes }
      const childRunIds: Array<string> = []
      for (const child of input.initialChildren) {
        const address = makeAddress(`spawn:${receipt.runId}`)
        const message = makeMessage({
          id: child.messageId ?? `spawn:${child.idempotencyKey}`,
          to: address,
          sessionId: child.sessionId,
          prompt: child.prompt,
          idempotencyKey: child.idempotencyKey,
          correlationId: child.correlationId ?? receipt.runId,
          metadata: child.metadata ?? {},
        })
        const [childReceipt, childState] = yield* admitSpawn(next, {
          ...child,
          parentRunId: receipt.runId,
          message,
        }).pipe(
          Effect.mapError((error) =>
            Schema.is(RunNotFound)(error) || Schema.is(RunTerminal)(error)
              ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial child admission" })
              : error,
          ),
        )
        childRunIds.push(childReceipt.runId)
        next = childState
      }
      const fanOuts: Array<FanOutReceipt> = []
      for (const fanOut of input.initialFanOuts) {
        const [fanOutReceipt, fanOutState] = yield* admitFanOut(next, fanOutAdmission(receipt, fanOut)).pipe(
          Effect.mapError((error) =>
            Schema.is(RunNotFound)(error) || Schema.is(RunTerminal)(error)
              ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial fan-out admission" })
              : error,
          ),
        )
        fanOuts.push(fanOutReceipt)
        next = fanOutState
      }
      return [startReceipt(receipt, childRunIds, fanOuts), next] as const
    }),
)

type AdmitSpawnResult = Effect.Effect<
  readonly [RunReceipt, MemoryState],
  | RunNotFound
  | RunTerminal
  | ChildSelectionMissing
  | IdempotencyConflict
  | RuntimeUnavailable
  | ChildDepthExceeded
  | ChildLimitExceeded
  | Exhausted
>

export const admitSpawn: {
  (
    input: SpawnInput & { readonly message: Message; readonly parentRunId: string },
  ): (state: MemoryState) => AdmitSpawnResult
  (
    state: MemoryState,
    input: SpawnInput & { readonly message: Message; readonly parentRunId: string },
  ): AdmitSpawnResult
} = Function.dual(
  2,
  (state: MemoryState, input: SpawnInput & { readonly message: Message; readonly parentRunId: string }) =>
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
      const digestInput: ChildDigestInput = {
        parentRunId: parent.runId,
        invocationId: input.invocationId,
      }
      if (input.label !== undefined) digestInput.label = input.label
      if (input.origin !== undefined) digestInput.origin = input.origin
      const digest = childDigest(input.message, executableRef, digestInput)
      const executable = yield* Effect.try({
        try: () => decodePinned({ ref: executableRef, manifest: parent.executableManifest }),
        catch: (error) => RuntimeUnavailable.make({ message: String(error) }),
      })
      const registrations = yield* narrow(executable, parent.registrations).pipe(
        Effect.mapError((error) => RuntimeUnavailable.make({ message: String(error) })),
      )
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
        return [duplicateReceipt(existing.receipt), state] as const
      }

      const [runId, withId] = newRunId(state)
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
      const childReadiness = readinessForAdmission(withId, parent)
      const parentBudget = yield* budgetForEvents(parent.events)
      if (parentBudget.children === 0) {
        return yield* Exhausted.make({ budget: "children", requested: 1, remaining: 0 })
      }
      const childBudget = childGrant(parentBudget, 1)
      const child: StoredRun = {
        runId,
        status: "queued",
        executableRef,
        executableManifest: parent.executableManifest,
        address: input.message.to,
        message: input.message,
        rootRunId: parent.rootRunId,
        depth,
        treePolicy: parent.treePolicy,
        parentRunId: parent.runId,
        childReadiness,
        invocationId: input.invocationId,
        lastSequence: -1,
        lastTurnCompletedSequence: -1,
        attempt: 0,
        attemptFence: 0,
        cancellationRequested: false,
        children: [],
        events: [],
        subscribers: new Map(),
        steering: [],
        registrations,
        checkpoints: new Map(),
      }
      const runs = new Map(withId.runs)
      const parentUpdated: StoredRun = { ...parent, children: [...parent.children, runId] }
      runs.set(parent.runId, parentUpdated)
      runs.set(runId, child)
      let next: MemoryState = { ...withId, runs }

      const [, linked] = yield* appendLifecycle(
        next,
        parent.runId,
        childLinkedEvent(runId, input.invocationId, input.selection, input.message.prompt, parent.depth + 1, {
          ...childDetails(childReadiness, input),
          budget: childBudget,
        }),
      )
      next = linked

      const [, accepted] = yield* appendLifecycle(
        next,
        runId,
        acceptedEvent({ address: input.message.to, messageId: input.message.id, budget: childBudget }),
        "queued",
      )
      next = accepted
      const receipt: RunReceipt = {
        runId,
        messageId: input.message.id,
        acceptedSequence: 0,
        duplicate: false,
      }
      const idempotency = new Map(next.idempotency)
      idempotency.set(key, { digest, executable, receipt })
      return [receipt, { ...next, idempotency }] as const
    }),
)
