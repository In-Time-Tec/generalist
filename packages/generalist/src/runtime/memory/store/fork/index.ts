import { Effect, Function, Predicate, Types } from "effect"
import {
  ForkSequenceInvalid,
  NoSnapshot,
  RunNotFound,
  RuntimeUnavailable,
  SubstitutionInvalid,
} from "../../../errors.js"
import { eventIdFor, type RunEvent } from "../../../run/event.js"
import type { ForkRunInput, RewindRunInput } from "../../../run/store-types.js"
import type { OperationRecord } from "../../../sql/operations.js"
import { copyModelResponse } from "./model-response.js"
import { ForkCheckpoint } from "../../../execution/recovery/fork-checkpoint.js"
import { validate as validatePayload, maximumEventBytes } from "../../../execution/payload/index.js"
import { appendEvent } from "../../append.js"
import {
  operationKeyMapKey,
  operationMapKey,
  type MemorySession,
  type MemoryState,
  type StoredRun,
} from "../../state.js"

const { forkCheckpoint, forkOperationKey } = ForkCheckpoint

const snapshotUnavailableAt = (run: StoredRun, sequence: number): boolean => {
  const latest = run.events.findLast(
    (event): event is Extract<RunEvent, { readonly _tag: "ToolProgress" }> =>
      event.sequence <= sequence && event._tag === "ToolProgress" && event.message === "SandboxSnapshot",
  )
  if (latest === undefined) return false
  return (
    !Predicate.isObject(latest.data) ||
    latest.data._tag !== "SandboxSnapshot" ||
    !Predicate.isString(latest.data.snapshotId)
  )
}

const validateSequence = (run: StoredRun, sequence: number) => {
  if (Number.isSafeInteger(sequence) && sequence >= 0 && sequence <= run.lastSequence) return Effect.void
  return ForkSequenceInvalid.make({ runId: run.runId, sequence, lastSequence: run.lastSequence })
}

const copiedEvents = (
  run: StoredRun,
  runId: string,
  sessionId: string,
  atSequence: number,
  includeTerminal = false,
): ReadonlyArray<RunEvent> =>
  run.events
    .filter(
      (event) =>
        event.sequence <= atSequence &&
        (includeTerminal ||
          (event._tag !== "RunCompleted" && event._tag !== "RunFailed" && event._tag !== "RunCancelled")),
    )
    .map((event) =>
      event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
        ? {
            ...event,
            runId,
            rootRunId: runId,
            eventId: eventIdFor(runId, event.sequence),
            sessionId,
            operationKey: forkOperationKey(event.operationKey, run.runId, runId),
          }
        : { ...event, runId, rootRunId: runId, eventId: eventIdFor(runId, event.sequence) },
    )

const sourceOperations = (state: MemoryState, runId: string): ReadonlyArray<OperationRecord> =>
  [...state.operations.entries()]
    .filter(([key, operation]) => !key.startsWith("key:") && operation.runId === runId)
    .map(([, operation]) => operation)

const selectedOperations = (
  state: MemoryState,
  sourceRunId: string,
  atSequence: number,
  substitute?: ForkRunInput["substitute"],
) =>
  Effect.gen(function* () {
    const source = sourceOperations(state, sourceRunId)
    const target =
      substitute === undefined
        ? undefined
        : source.find((operation) => operation.operationId === substitute.operationId)
    if (
      substitute !== undefined &&
      (target === undefined ||
        target.kind !== "tool" ||
        target.status !== "succeeded" ||
        (target.completedSequence ?? Number.POSITIVE_INFINITY) > atSequence)
    ) {
      return yield* SubstitutionInvalid.make({ runId: sourceRunId, operationId: substitute.operationId })
    }
    const cutoff = target?.completedSequence ?? atSequence
    return { source, target, cutoff }
  })

const replaceOperations = (input: {
  readonly operations: ReadonlyMap<string, OperationRecord>
  readonly sourceRunId: string
  readonly sourceSessionId: string
  readonly targetRunId: string
  readonly targetSessionId: string
  readonly sourceSession?: MemorySession
  readonly targetSession?: MemorySession
  readonly sourceEvents: ReadonlyArray<RunEvent>
  readonly selected: ReadonlyArray<OperationRecord>
  readonly cutoff: number
  readonly substitute?: ForkRunInput["substitute"]
  readonly removeTarget?: boolean
}) =>
  Effect.gen(function* () {
    const operations = new Map(input.operations)
    const entries = new Map(input.targetSession?.entries)
    if (input.removeTarget === true) {
      for (const [key, operation] of operations) {
        if (operation.runId === input.targetRunId) operations.delete(key)
      }
    }
    for (const operation of input.selected) {
      if ((operation.completedSequence ?? Number.POSITIVE_INFINITY) > input.cutoff) continue
      const { checkpoint, ...operationWithoutCheckpoint } = operation
      let copied: Types.Mutable<OperationRecord> = {
        ...operationWithoutCheckpoint,
        runId: input.targetRunId,
        operationKey: forkOperationKey(operation.operationKey, input.sourceRunId, input.targetRunId),
      }
      if (checkpoint !== undefined)
        copied.checkpoint = forkCheckpoint(checkpoint, input.sourceRunId, input.targetRunId, input.targetSessionId)
      if (operation.kind === "model" && operation.status === "succeeded") {
        const { reference, entry } = yield* copyModelResponse({
          ...input,
          operation,
          targetOperationKey: copied.operationKey,
        })
        copied = { ...copied, result: reference }
        entries.set(entry.id, entry)
      }
      if (operation.operationId === input.substitute?.operationId)
        copied = { ...copied, result: input.substitute.result }
      operations.set(operationMapKey(input.targetRunId, copied.operationId), copied)
      operations.set(operationKeyMapKey(input.targetRunId, copied.operationKey), copied)
    }
    return { operations, session: input.targetSession === undefined ? undefined : { ...input.targetSession, entries } }
  })

const leafAt = (events: ReadonlyArray<RunEvent>): string | null => {
  const response = events.findLast(
    (event): event is Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }> =>
      event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted",
  )
  return response?.sessionEntryId ?? null
}

const copiedSession = (session: MemorySession, leaf: string | null): MemorySession => {
  const copy: Types.Mutable<MemorySession> = {
    entries: new Map(session.entries),
    order: [...session.order],
    leaf,
    counter: session.counter,
    writerEpoch: 0n,
  }
  return copy
}

const rewoundSession = (session: MemorySession, leaf: string | null) => {
  const retainedLength = leaf === null ? 0 : session.order.indexOf(leaf) + 1
  if (leaf !== null && retainedLength === 0) {
    return RuntimeUnavailable.make({ message: `Session entry ${leaf} could not be retained during rewind` })
  }
  const order = session.order.slice(0, retainedLength)
  const retained = new Set(order)
  const copy: Types.Mutable<MemorySession> = {
    entries: new Map([...session.entries].filter(([entryId]) => retained.has(entryId))),
    order,
    leaf,
    counter: session.counter,
    writerEpoch: 0n,
  }
  return Effect.succeed(copy)
}

const copiedRun = (
  source: StoredRun,
  runId: string,
  sessionId: string,
  atSequence: number,
  events: ReadonlyArray<RunEvent>,
): StoredRun => {
  const {
    checkpoint: _checkpoint,
    suspension: _suspension,
    continuation: _continuation,
    terminalEventId: _terminalEventId,
    pendingOutcome: _pendingOutcome,
    ownerId: _ownerId,
    forkedFrom: _forkedFrom,
    forkSequence: _forkSequence,
    ...base
  } = source
  const checkpoint = source.checkpoints.get(atSequence)
  const message = {
    ...source.message,
    id: `fork:${runId}`,
    sessionId: `${source.message.sessionId}:fork:${runId}`,
    idempotencyKey: `fork:${runId}`,
  }
  const run: Types.Mutable<StoredRun> = {
    ...base,
    runId,
    status: "queued",
    message,
    rootRunId: runId,
    depth: 0,
    forkedFrom: source.runId,
    forkSequence: atSequence,
    lastSequence: events.at(-1)?.sequence ?? -1,
    lastTurnCompletedSequence: Math.min(source.lastTurnCompletedSequence, events.at(-1)?.sequence ?? -1),
    attemptFence: source.attemptFence + 1,
    cancellationRequested: false,
    children: [],
    events,
    subscribers: new Map(),
    steering: [],
    checkpoints: new Map(
      [...source.checkpoints]
        .filter(([sequence]) => sequence <= atSequence)
        .map(
          ([sequence, value]) =>
            [
              sequence,
              value === undefined ? undefined : forkCheckpoint(value, source.runId, runId, sessionId),
            ] as const,
        ),
    ),
  }
  if (checkpoint !== undefined) run.checkpoint = forkCheckpoint(checkpoint, source.runId, runId, sessionId)
  return run
}

const addTreeRoot = (treeRoots: MemoryState["treeRoots"], runId: string, events: ReadonlyArray<RunEvent>) => {
  const roots = new Map(treeRoots)
  roots.set(runId, {
    earliestPosition: 0,
    lastPosition: events.length - 1,
    events: [],
    subscribers: new Map(),
  })
  return roots
}

const forkEffect = (state: MemoryState, input: ForkRunInput) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    yield* validateSequence(source, input.atSequence)
    if (snapshotUnavailableAt(source, input.atSequence)) {
      return yield* NoSnapshot.make({ runId: input.runId, atSequence: input.atSequence })
    }
    const selection = yield* selectedOperations(state, input.runId, input.atSequence, input.substitute)
    const targetSessionId = `${source.message.sessionId}:fork:${input.newRunId}`
    const events = copiedEvents(source, input.newRunId, targetSessionId, input.atSequence)
    yield* Effect.forEach(
      events,
      (event) => validatePayload({ value: event, boundary: "fork event", limit: maximumEventBytes }),
      { discard: true },
    )
    const run: Types.Mutable<StoredRun> = copiedRun(source, input.newRunId, targetSessionId, input.atSequence, events)
    if (selection.target?.checkpoint !== undefined) {
      run.checkpoint = forkCheckpoint(selection.target.checkpoint, input.runId, input.newRunId, targetSessionId)
    }
    const runs = new Map(state.runs).set(input.newRunId, run)
    const sessions = new Map(state.sessions)
    const sourceSession = sessions.get(source.message.sessionId)
    const initialSession = sourceSession === undefined ? undefined : copiedSession(sourceSession, leafAt(events))
    const { operations, session: targetSession } = yield* replaceOperations({
      operations: state.operations,
      sourceRunId: input.runId,
      sourceSessionId: source.message.sessionId,
      targetRunId: input.newRunId,
      targetSessionId: run.message.sessionId,
      ...(initialSession === undefined ? undefined : { targetSession: initialSession }),
      ...(sourceSession === undefined ? undefined : { sourceSession }),
      sourceEvents: source.events,
      selected: selection.source,
      cutoff: selection.cutoff,
      ...(input.substitute === undefined ? undefined : { substitute: input.substitute }),
    })
    if (targetSession !== undefined) sessions.set(run.message.sessionId, targetSession)
    run.events = events.map((event) => {
      if (event._tag !== "ModelResponseCommitted" || targetSession === undefined) return event
      const digest = targetSession.entries.get(event.sessionEntryId)?.metadata?.modelResponseDigest
      return Predicate.isString(digest) ? { ...event, digest } : event
    })
    let next: MemoryState = {
      ...state,
      runs,
      sessions,
      operations,
      treeRoots: addTreeRoot(state.treeRoots, input.newRunId, events),
    }
    if (input.substitute !== undefined) {
      const operationId = input.substitute.operationId
      const [, appended] = yield* appendEvent(next, input.newRunId, (base) => ({
        ...base,
        _tag: "Substituted",
        operationId,
      }))
      next = appended
    }
    return [{ runId: input.newRunId, messageId: run.message.id, acceptedSequence: 0, duplicate: false }, next] as const
  })
type ForkEffect = ReturnType<typeof forkEffect>
export const fork: {
  (input: ForkRunInput): (state: MemoryState) => ForkEffect
  (state: MemoryState, input: ForkRunInput): ForkEffect
} = Function.dual(2, forkEffect)

const rewindEffect = (state: MemoryState, input: RewindRunInput) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    yield* validateSequence(source, input.toSequence)
    if (snapshotUnavailableAt(source, input.toSequence)) {
      return yield* NoSnapshot.make({ runId: input.runId, atSequence: input.toSequence })
    }
    const selection = {
      source: sourceOperations(state, input.runId),
      cutoff: source.lastSequence,
    }
    const branchSessionId = `${source.message.sessionId}:fork:${input.branchRunId}`
    const branchEvents = copiedEvents(source, input.branchRunId, branchSessionId, source.lastSequence, true)
    yield* Effect.forEach(
      branchEvents,
      (event) => validatePayload({ value: event, boundary: "fork event", limit: maximumEventBytes }),
      {
        discard: true,
      },
    )
    const branch: Types.Mutable<StoredRun> = copiedRun(
      source,
      input.branchRunId,
      branchSessionId,
      input.toSequence,
      branchEvents,
    )
    branch.status = source.status
    if (source.checkpoint !== undefined)
      branch.checkpoint = forkCheckpoint(source.checkpoint, input.runId, input.branchRunId, branchSessionId)
    const events = copiedEvents(source, input.runId, source.message.sessionId, input.toSequence)
    const rewoundBase = copiedRun(source, input.runId, source.message.sessionId, input.toSequence, events)
    const rewound: Types.Mutable<StoredRun> = { ...rewoundBase, message: source.message }
    if (source.forkedFrom !== undefined) rewound.forkedFrom = source.forkedFrom
    else delete rewound.forkedFrom
    if (source.forkSequence !== undefined) rewound.forkSequence = source.forkSequence
    else delete rewound.forkSequence
    const runs = new Map(state.runs).set(input.branchRunId, branch).set(input.runId, rewound)
    const sessions = new Map(state.sessions)
    const sourceSession = sessions.get(source.message.sessionId)
    const initialBranchSession =
      sourceSession === undefined ? undefined : copiedSession(sourceSession, leafAt(branchEvents))
    if (sourceSession !== undefined) {
      sessions.set(source.message.sessionId, yield* rewoundSession(sourceSession, leafAt(events)))
    }
    const { operations: branchOperations, session: branchSession } = yield* replaceOperations({
      operations: state.operations,
      sourceRunId: input.runId,
      sourceSessionId: source.message.sessionId,
      targetRunId: input.branchRunId,
      targetSessionId: branch.message.sessionId,
      ...(initialBranchSession === undefined ? undefined : { targetSession: initialBranchSession }),
      ...(sourceSession === undefined ? undefined : { sourceSession }),
      sourceEvents: source.events,
      selected: selection.source,
      cutoff: source.lastSequence,
    })
    if (branchSession !== undefined) sessions.set(branch.message.sessionId, branchSession)
    branch.events = branchEvents.map((event) => {
      if (event._tag !== "ModelResponseCommitted" || branchSession === undefined) return event
      const digest = branchSession.entries.get(event.sessionEntryId)?.metadata?.modelResponseDigest
      return Predicate.isString(digest) ? { ...event, digest } : event
    })
    const { operations, session: retainedSession } = yield* replaceOperations({
      operations: branchOperations,
      sourceRunId: input.runId,
      sourceSessionId: source.message.sessionId,
      targetRunId: input.runId,
      targetSessionId: source.message.sessionId,
      ...(sessions.get(source.message.sessionId) === undefined
        ? undefined
        : { targetSession: sessions.get(source.message.sessionId)! }),
      ...(sessions.get(source.message.sessionId) === undefined
        ? undefined
        : { sourceSession: sessions.get(source.message.sessionId)! }),
      sourceEvents: events,
      selected: selection.source,
      cutoff: input.toSequence,
      removeTarget: true,
    })
    if (retainedSession !== undefined) sessions.set(source.message.sessionId, retainedSession)
    return [
      undefined,
      {
        ...state,
        runs,
        sessions,
        operations,
        treeRoots: addTreeRoot(addTreeRoot(state.treeRoots, input.runId, events), input.branchRunId, branchEvents),
      },
    ] as const
  })
type RewindEffect = ReturnType<typeof rewindEffect>
export const rewind: {
  (input: RewindRunInput): (state: MemoryState) => RewindEffect
  (state: MemoryState, input: RewindRunInput): RewindEffect
} = Function.dual(2, rewindEffect)
