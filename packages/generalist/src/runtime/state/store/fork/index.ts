import { Effect, Function, Predicate, Types } from "effect"
import {
  ForkSequenceInvalid,
  NoSnapshot,
  RunNotFound,
  RuntimeUnavailable,
  SubstitutionInvalid,
} from "../../../errors.js"
import { eventIdFor, type RunEvent } from "../../../run/event.js"
import type { ForkRunInput as ForkCommand, RewindRunInput as RewindCommand } from "../../../run/store-types.js"
import type { OperationRecord } from "../../../operation/record.js"
import { copyModelResponse } from "./model-response.js"
import { ForkCheckpoint } from "../../../execution/recovery/fork-checkpoint.js"
import { validate as validatePayload, maximumEventBytes } from "../../../execution/payload/index.js"
import { appendEvent } from "../../append.js"
import { budgetForEvents, spendForEvents } from "../../../execution/inspection.js"
import type { ExecutionCheckpoint } from "../../../execution/state.js"
import { charge, Invalid as BudgetInvalid, make as makeBudget, reserveChild, type BudgetLimits, type Remaining } from "../../../../core/durable/run-budget.js"
import { forkProgram, programBranchCheckpoint } from "./program.js"
import { occurredAtMillis } from "../../observation.js"
import { runnableLimits } from "../../../budget/state.js"
import {
  operationKeyMapKey,
  operationMapKey,
  type RuntimeSession,
  type RuntimeState,
  type StoredRun,
} from "../../state.js"

const { forkCheckpoint, forkOperationKey } = ForkCheckpoint
type ForkRunInput = Omit<ForkCommand, "commandId">
type RewindRunInput = Omit<RewindCommand, "commandId">

const dimensions = ["tokens", "usd", "duration", "toolCalls", "children"] as const

/** Unknown priced usage cannot become spendable capacity after a branch change. */
const availableBudget = (remaining: Remaining) =>
  makeBudget(runnableLimits(remaining))

const withCurrentBudget = (checkpoint: ExecutionCheckpoint, remaining: Remaining): ExecutionCheckpoint =>
  "_tag" in checkpoint ? checkpoint : { ...checkpoint, budget: availableBudget(remaining) }

const reserveForkBudget = (source: StoredRun, requested: BudgetLimits | undefined) =>
  Effect.gen(function* () {
    const available = yield* budgetForEvents(source.events, yield* occurredAtMillis)
    const accepted = source.events.find((event) => event._tag === "RunAccepted")
    if (requested === undefined) {
      if (dimensions.some((dimension) => available[dimension] !== undefined) || accepted?.budget === undefined) {
        return yield* BudgetInvalid.make({ message: "Fork requires an explicit new budget allocation" })
      }
      requested = {}
    }
    for (const dimension of dimensions) {
      if (available[dimension] !== undefined && requested[dimension] === undefined) {
        return yield* BudgetInvalid.make({ message: `Fork allocation must bound ${dimension}` })
      }
    }
    const reserved = yield* reserveChild(availableBudget(available), requested)
    const parent = yield* charge(reserved.parent, { children: reserved.child.allocation.children ?? 0 })
    return { parent, child: reserved.child }
  })

/** Settled child allowances have returned upstream; their old remainder is no longer theirs to grant. */
const allocationOwner = (state: RuntimeState, source: StoredRun) =>
  Effect.gen(function* () {
    let owner = source
    const seen = new Set<string>()
    while (owner.parentRunId !== undefined) {
      if (seen.has(owner.runId))
        return yield* RuntimeUnavailable.make({ message: "Fork budget ancestry contains a cycle" })
      seen.add(owner.runId)
      const parent = state.runs.get(owner.parentRunId)
      if (parent === undefined)
        return yield* RuntimeUnavailable.make({ message: "Fork budget parent is missing" })
      const settlement = parent.events.findLast(
        (event): event is Extract<RunEvent, { readonly _tag: "ChildSettled" }> =>
          event._tag === "ChildSettled" && event.childRunId === owner.runId,
      )
      if (settlement === undefined) break
      const terminal = owner.events.find((event) => event.eventId === settlement.terminalEventId &&
        (event._tag === "RunCompleted" || event._tag === "RunFailed" || event._tag === "RunCancelled"))
      if (terminal === undefined)
        return yield* RuntimeUnavailable.make({ message: "Fork budget settlement does not match retained child history" })
      if (owner.events.some((event) => event._tag === "RunRewound" &&
        event.allocation !== undefined && event.sequence > terminal.sequence)) break
      owner = parent
    }
    return owner
  })

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
    .map((event) => {
      const remapped =
        runId === run.runId
          ? event
          : (({ parentRunId: _parentRunId, ...withoutParent }) => withoutParent)(event)
      return remapped._tag === "ModelResponseCommitted" || remapped._tag === "ModelResponseInterrupted"
        ? {
            ...remapped,
            runId,
            rootRunId: runId,
            eventId: eventIdFor(runId, remapped.sequence),
            sessionId,
            operationKey: forkOperationKey(remapped.operationKey, run.runId, runId),
          }
        : { ...remapped, runId, rootRunId: runId, eventId: eventIdFor(runId, remapped.sequence) }
    })

const sourceOperations = (state: RuntimeState, runId: string): ReadonlyArray<OperationRecord> =>
  [...state.operations.entries()]
    .filter(([key, operation]) => !key.startsWith("key:") && operation.runId === runId)
    .map(([, operation]) => operation)

const selectedOperations = (
  state: RuntimeState,
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
  readonly sourceSession?: RuntimeSession
  readonly targetSession?: RuntimeSession
  readonly sourceEvents: ReadonlyArray<RunEvent>
  readonly selected: ReadonlyArray<OperationRecord>
  readonly cutoff: number
  readonly substitute?: ForkRunInput["substitute"]
  readonly budget?: Remaining
}) =>
  Effect.gen(function* () {
    const operations = new Map(input.operations)
    const entries = new Map(input.targetSession?.entries)
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
      if (copied.checkpoint !== undefined && input.budget !== undefined)
        copied.checkpoint = withCurrentBudget(copied.checkpoint, input.budget)
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

const copiedSession = (session: RuntimeSession, leaf: string | null): RuntimeSession => {
  const copy: Types.Mutable<RuntimeSession> = {
    entries: new Map(session.entries),
    order: [...session.order],
    leaf,
    counter: session.counter,
    writerEpoch: 0n,
  }
  return copy
}

const rewoundSession = (session: RuntimeSession, leaf: string | null) => {
  if (leaf !== null && !session.entries.has(leaf)) {
    return RuntimeUnavailable.make({ message: `Session entry ${leaf} could not be retained during rewind` })
  }
  const copy: Types.Mutable<RuntimeSession> = {
    entries: session.entries,
    order: session.order,
    leaf,
    counter: session.counter,
    writerEpoch: session.writerEpoch + 1n,
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
    parentRunId: _parentRunId,
    invocationId: _invocationId,
    childReadiness: _childReadiness,
    ...base
  } = source
  const checkpoint = source.checkpoints.get(atSequence)
  const message = {
    ...source.message,
    id: `fork:${runId}`,
    sessionId,
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
    operationNamespace: runId,
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

const addTreeRoot = (treeRoots: RuntimeState["treeRoots"], runId: string, events: ReadonlyArray<RunEvent>) => {
  const roots = new Map(treeRoots)
  roots.set(runId, {
    earliestPosition: 0,
    lastPosition: events.length - 1,
    events: [],
    subscribers: new Map(),
  })
  return roots
}

const forkEffect = (state: RuntimeState, input: ForkRunInput) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (state.runs.has(input.newRunId))
      return yield* RuntimeUnavailable.make({ message: `Fork target ${input.newRunId} already exists` })
    if (source.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({ message: "Release source execution authority before reserving a fork allocation" })
    const owner = yield* allocationOwner(state, source)
    if (owner.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({ message: "Release the current budget owner's authority before allocating a fork" })
    const allocation = yield* reserveForkBudget(owner, input.budget)
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
    if (run.checkpoint !== undefined) run.checkpoint = withCurrentBudget(run.checkpoint, allocation.child.remaining)
    const programCheckpoint = yield* programBranchCheckpoint(state, source, input.atSequence, input.newRunId)
    const program = yield* forkProgram(state, source, input.newRunId, programCheckpoint, input.programBudget)
    if (programCheckpoint !== undefined) run.checkpoint = programCheckpoint
    const ownerAfterReservation = owner.checkpoint === undefined
      ? owner
      : { ...owner, checkpoint: withCurrentBudget(owner.checkpoint, allocation.parent.remaining) }
    const runs = new Map(state.runs).set(owner.runId, ownerAfterReservation).set(input.newRunId, run)
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
      budget: allocation.child.remaining,
      ...(input.substitute === undefined ? undefined : { substitute: input.substitute }),
    })
    if (targetSession !== undefined) sessions.set(run.message.sessionId, targetSession)
    run.events = events.map((event) => {
      if (event._tag !== "ModelResponseCommitted" || targetSession === undefined) return event
      const digest = targetSession.entries.get(event.sessionEntryId)?.metadata?.modelResponseDigest
      return Predicate.isString(digest) ? { ...event, digest } : event
    })
    let next: RuntimeState = {
      ...state,
      runs,
      sessions,
      operations,
      ...program,
      treeRoots: addTreeRoot(state.treeRoots, input.newRunId, events),
    }
    const boundary = {
      _tag: "RunForked" as const,
      sourceRunId: input.runId,
      allocationRunId: owner.runId,
      forkRunId: input.newRunId,
      atSequence: input.atSequence,
      budget: allocation.child.allocation,
      ...(input.programBudget === undefined ? {} : { programBudget: input.programBudget }),
    }
    const [, reserved] = yield* appendEvent(next, owner.runId, (base) => ({ ...base, ...boundary, role: "source" }))
    const [, allocated] = yield* appendEvent(reserved, input.newRunId, (base) => ({ ...base, ...boundary, role: "target" }))
    next = allocated
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
  (input: ForkRunInput): (state: RuntimeState) => ForkEffect
  (state: RuntimeState, input: ForkRunInput): ForkEffect
} = Function.dual(2, forkEffect)

const rewindEffect = (state: RuntimeState, input: RewindRunInput) =>
  Effect.gen(function* () {
    const source = state.runs.get(input.runId)
    if (source === undefined) return yield* RunNotFound.make({ runId: input.runId })
    if (state.runs.has(input.branchRunId))
      return yield* RuntimeUnavailable.make({ message: `Rewind archive ${input.branchRunId} already exists` })
    const nowMillis = yield* occurredAtMillis
    const owner = yield* allocationOwner(state, source)
    if (owner.runId !== source.runId && input.budget === undefined)
      return yield* BudgetInvalid.make({ message: "Rewinding a settled child requires a new ancestor budget allocation" })
    if (owner.runId === source.runId && input.budget !== undefined)
      return yield* BudgetInvalid.make({ message: "This Run retains its current allocation; use a budget extension to add capacity" })
    if (owner.runId !== source.runId && owner.ownerId !== undefined)
      return yield* RuntimeUnavailable.make({ message: "Release the current budget owner's authority before reallocating a rewind" })
    const reservation = owner.runId === source.runId ? undefined : yield* reserveForkBudget(owner, input.budget)
    const available = reservation?.child.remaining ?? (yield* budgetForEvents(source.events, nowMillis))
    const baseline = reservation === undefined ? undefined : yield* spendForEvents(source.events, nowMillis)
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
    branch.status = "queued"
    if (source.checkpoint !== undefined)
      branch.checkpoint = withCurrentBudget(
        forkCheckpoint(source.checkpoint, input.runId, input.branchRunId, branchSessionId),
        { tokens: 0, usd: 0, duration: 0, toolCalls: 0, children: 0 },
      )
    const events = copiedEvents(source, input.runId, source.message.sessionId, input.toSequence)
    const rewoundBase = copiedRun(source, input.runId, source.message.sessionId, input.toSequence, events)
    const rewound: Types.Mutable<StoredRun> = {
      ...rewoundBase,
      message: source.message,
      rootRunId: source.rootRunId,
      depth: source.depth,
      children: source.children,
      events: source.events,
      lastSequence: source.lastSequence,
      checkpoints: source.checkpoints,
      subscribers: source.subscribers,
      operationNamespace: `${input.runId}:rewind:${rewoundBase.attemptFence}`,
      steering: source.steering.map((entry) =>
        entry.consumedOperationId !== undefined || entry.discardedReason !== undefined
          ? entry
          : { ...entry, discardedReason: "cancelled" as const },
      ),
    }
    if (rewound.checkpoint !== undefined) {
      rewound.checkpoint = withCurrentBudget(
        forkCheckpoint(
          rewound.checkpoint,
          input.runId,
          input.runId,
          source.message.sessionId,
          `${input.runId}:rewind:${rewound.attemptFence}`,
        ),
        available,
      )
    }
    const programCheckpoint = yield* programBranchCheckpoint(
      state, source, input.toSequence, rewound.operationNamespace!,
    )
    if (programCheckpoint !== undefined) rewound.checkpoint = programCheckpoint
    if (source.forkedFrom !== undefined) rewound.forkedFrom = source.forkedFrom
    else delete rewound.forkedFrom
    if (source.forkSequence !== undefined) rewound.forkSequence = source.forkSequence
    else delete rewound.forkSequence
    if (source.parentRunId !== undefined) rewound.parentRunId = source.parentRunId
    if (source.invocationId !== undefined) rewound.invocationId = source.invocationId
    if (source.childReadiness !== undefined) rewound.childReadiness = source.childReadiness
    const runs = new Map(state.runs).set(input.branchRunId, branch).set(input.runId, rewound)
    if (reservation !== undefined) {
      rewound.childReadiness = "ready"
      runs.set(source.runId, rewound)
      runs.set(owner.runId, owner.checkpoint === undefined
        ? owner
        : { ...owner, checkpoint: withCurrentBudget(owner.checkpoint, reservation.parent.remaining) })
    }
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
    let next: RuntimeState = {
      ...state,
      runs,
      sessions,
      operations: branchOperations,
      treeRoots: addTreeRoot(state.treeRoots, input.branchRunId, branch.events),
    }
    if (reservation !== undefined) {
      const [, allocated] = yield* appendEvent(next, owner.runId, (base) => ({
        ...base,
        _tag: "RunForked",
        sourceRunId: input.runId,
        allocationRunId: owner.runId,
        forkRunId: input.runId,
        atSequence: input.toSequence,
        role: "source",
        budget: reservation.child.allocation,
      }))
      next = allocated
    }
    const [, archived] = yield* appendEvent(next, input.branchRunId, (base) => ({
      ...base,
      _tag: "RunForked",
      sourceRunId: input.runId,
      allocationRunId: input.runId,
      forkRunId: input.branchRunId,
      atSequence: input.toSequence,
      role: "archive",
      budget: { tokens: 0, usd: 0, duration: 0, toolCalls: 0, children: 0 },
    }))
    const [, closed] = yield* appendEvent(archived, input.branchRunId, (base) => ({
      ...base,
      _tag: "RunCancelled",
      reason: "Historical branch retained by rewind; no execution allocation",
    }), "cancelled")
    const [, retained] = yield* appendEvent(closed, input.runId, (base) => ({
      ...base,
      _tag: "RunRewound",
      toSequence: input.toSequence,
      branchRunId: input.branchRunId,
      ...(reservation === undefined ? {} : {
        allocation: { runId: owner.runId, budget: reservation.child.allocation, baseline: baseline! },
      }),
    }))
    next = retained
    return [undefined, next] as const
  })
type RewindEffect = ReturnType<typeof rewindEffect>
export const rewind: {
  (input: RewindRunInput): (state: RuntimeState) => RewindEffect
  (state: RuntimeState, input: RewindRunInput): RewindEffect
} = Function.dual(2, rewindEffect)
