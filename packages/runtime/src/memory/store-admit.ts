import { Effect } from "effect"
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
} from "../errors.js"
import { decodePinned, equals, resolveChild } from "../executable-manifest.js"
import type { RunReceipt } from "../run.js"
import type { AdmitProgramChildInput, AdmitSendInput, AdmitStartInput } from "../run-store.js"
import { digest as registrationDigest } from "../executable-registration.js"
import { narrow } from "../executable-registration.js"
import type { Message } from "../message.js"
import type { SpawnInput } from "../runtime.js"
import type { StartReceipt } from "../runtime.js"
import { appendLifecycle, makeAccepted, makeAttemptStarted, makeChildLinked } from "./append.js"
import { childDigest, messageDigest, startDigest } from "./digest.js"
import { enqueueLane, promoteHead } from "./lanes.js"
import { idempotencyKey, laneKey, type MemoryState, type StoredRun } from "./state.js"
import { make as makeAddress } from "../address.js"
import { make as makeMessage } from "../message.js"
import { childRunIdFor, fanOutIdFor } from "../fan-out.js"
import { admitFanOut } from "./store-fan-out.js"

const newRunId = (state: MemoryState): readonly [string, MemoryState] => {
  const runId = `run_${state.nextRunCounter}`
  return [runId, { ...state, nextRunCounter: state.nextRunCounter + 1 }]
}

export const admitSend = (
  state: MemoryState,
  input: AdmitSendInput,
  digestOverride?: string,
  promote = true,
): Effect.Effect<
  readonly [RunReceipt, MemoryState],
  IdempotencyConflict | RunIdConflict | ExecutableRegistrationConflict | RuntimeUnavailable
> =>
  Effect.gen(function* () {
    if (state.closed) {
      return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    }
    const digest = digestOverride ?? messageDigest(input.message)
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
    const registrationCatalog = new Map(state.registrationCatalog)
    for (const registration of input.registrations) {
      const registrationValueDigest = registrationDigest(registration)
      const existingRegistration = registrationCatalog.get(registration.pin)
      if (existingRegistration !== undefined && existingRegistration.digest !== registrationValueDigest) {
        return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
      }
      registrationCatalog.set(registration.pin, { digest: registrationValueDigest, value: registration })
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
      registrations: input.registrations,
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
    if (enqueued.isHead && promote) {
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
    return [receipt, { ...next, idempotency, registrationCatalog }] as const
  })

export const admitStart = (
  state: MemoryState,
  input: AdmitStartInput,
): Effect.Effect<
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
> =>
  Effect.gen(function* () {
    if (input.initialChildren.length > 64) {
      return yield* StartInvalid.make({ message: "initialChildren cannot contain more than 64 requests" })
    }
    if (input.initialFanOuts.length > 64) {
      return yield* StartInvalid.make({ message: "initialFanOuts cannot contain more than 64 requests" })
    }
    const active = input.executableManifest.entries.find((entry) => entry.pin === input.executableRef.active)
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
    const resolved = input.initialChildren.map((child) => ({
      child,
      executableRef:
        active?._tag === "Agent"
          ? resolveChild(input.executableRef, input.executableManifest, child.selection)
          : undefined,
    }))
    const missing = resolved.find((entry) => entry.executableRef === undefined)
    if (missing !== undefined) {
      return yield* ChildSelectionMissing.make({
        parentRunId: input.runId ?? "pending",
        selection: missing.child.selection,
      })
    }
    const catalog = new Map(state.registrationCatalog)
    for (const registration of input.registrations) {
      const digest = registrationDigest(registration)
      const existing = catalog.get(registration.pin)
      if (existing !== undefined && existing.digest !== digest) {
        return yield* ExecutableRegistrationConflict.make({ pin: registration.pin })
      }
      catalog.set(registration.pin, { digest, value: registration })
    }
    const [receipt, admitted] = yield* admitSend(
      { ...state, registrationCatalog: catalog },
      input,
      startDigest(input),
      input.initialChildren.length === 0,
    )
    if (receipt.duplicate) {
      const root = admitted.runs.get(receipt.runId)!
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
      const fanOuts = [] as Array<import("../fan-out.js").FanOutReceipt>
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
      return [{ ...receipt, childRunIds, fanOuts }, admitted] as const
    }
    const lanes = new Map(admitted.lanes)
    lanes.delete(laneKey(input.message.to, input.message.sessionId))
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
          error instanceof RunNotFound || error instanceof RunTerminal
            ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial child admission" })
            : error,
        ),
      )
      childRunIds.push(childReceipt.runId)
      next = childState
    }
    const fanOuts = [] as Array<import("../fan-out.js").FanOutReceipt>
    for (const fanOut of input.initialFanOuts) {
      const fanOutId = fanOutIdFor(receipt.runId, fanOut.idempotencyKey)
      const [fanOutReceipt, fanOutState] = yield* admitFanOut(next, {
        ...fanOut,
        parentRunId: receipt.runId,
        fanOutId,
        concurrency: Math.min(fanOut.concurrency, fanOut.members.length),
        members: fanOut.members.map((member, ordinal) => ({
          ordinal,
          key: member.key,
          childRunId: childRunIdFor(fanOutId, ordinal),
          selection: member.selection,
          prompt: member.prompt,
          sessionId: member.sessionId ?? `fanout:${fanOutId}`,
          metadata: member.metadata ?? {},
        })),
      }).pipe(
        Effect.mapError((error) =>
          error instanceof RunNotFound || error instanceof RunTerminal
            ? RuntimeUnavailable.make({ message: "newly admitted root unavailable during initial fan-out admission" })
            : error,
        ),
      )
      fanOuts.push(fanOutReceipt)
      next = fanOutState
    }
    return [{ ...receipt, childRunIds, fanOuts }, next] as const
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
      registrations,
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

export const admitProgramChild = (
  state: MemoryState,
  input: AdmitProgramChildInput,
): Effect.Effect<
  readonly [RunReceipt, MemoryState],
  RunNotFound | RunTerminal | IdempotencyConflict | RunIdConflict | RuntimeUnavailable
> =>
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
      return [{ ...existing.receipt, duplicate: true }, state] as const
    }
    if (state.runs.has(input.childRunId)) {
      return yield* RunIdConflict.make({ runId: input.childRunId, existingRunId: input.childRunId })
    }
    const child: StoredRun = {
      runId: input.childRunId,
      status: "queued",
      executableRef: input.executableRef,
      executableManifest: input.executableManifest,
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
      registrations,
    }
    const runs = new Map(state.runs)
    runs.set(parent.runId, { ...parent, children: [...parent.children, child.runId] })
    runs.set(child.runId, child)
    let next: MemoryState = { ...state, runs }
    const [, linked] = yield* appendLifecycle(next, parent.runId, makeChildLinked(child.runId, input.invocationId))
    next = linked
    const [, accepted] = yield* appendLifecycle(
      next,
      child.runId,
      makeAccepted(input.message.to, input.message.id),
      "queued",
    )
    next = accepted
    const [, started] = yield* appendLifecycle(next, child.runId, makeAttemptStarted(1), "running")
    next = started
    const receipt = { runId: child.runId, messageId: input.message.id, acceptedSequence: 0, duplicate: false }
    const idempotency = new Map(next.idempotency)
    idempotency.set(key, { digest, executable, receipt })
    return [receipt, { ...next, idempotency }] as const
  })
