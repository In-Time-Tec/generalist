import { requireConversationalSlot } from "../admission/activation.js"
import { withCurrentBudget, reserveForkAllocation, reserveRewindAllocation } from "./allocation.js"
import {
  copiedEvents,
  copiedRun,
  copiedSession,
  rewoundSession,
  leafAt,
  addTreeRoot,
  restoreRewoundOrigin,
} from "./history.js"
import { Effect, Function, Predicate, Types } from "effect"
import { ForkSequenceInvalid, NoSnapshot, RuntimeUnavailable, SubstitutionInvalid } from "../../../errors.js"
import { publishConversation } from "../host-session/conversation.js"
import type { RunEvent } from "../../../run/event.js"
import type { ForkRunInput as ForkCommand, RewindRunInput as RewindCommand } from "../../../run/store-types.js"
import type { OperationRecord } from "../../../operation/record.js"
import { copyModelResponse } from "./model-response.js"
import { ForkCheckpoint } from "../../../execution/recovery/fork-checkpoint.js"
import { validate as validatePayload, maximumEventBytes } from "../../../execution/payload/index.js"
import { appendEvent } from "../../append.js"
import type { Remaining } from "../../../../core/durable/run-budget.js"
import { forkProgram, programBranchCheckpoint } from "./program.js"
import {
  operationKeyMapKey,
  operationMapKey,
  type RuntimeSession,
  type RuntimeState,
  type StoredRun,
} from "../../projection.js"

const { forkCheckpoint, forkOperationKey } = ForkCheckpoint
type ForkRunInput = Omit<ForkCommand, "commandId">
type RewindRunInput = Omit<RewindCommand, "commandId">

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

const forkEffect = (state: RuntimeState, input: ForkRunInput) =>
  Effect.gen(function* () {
    const { source, owner, allocation } = yield* reserveForkAllocation({ state, input })
    yield* validateSequence(source, input.atSequence)
    if (snapshotUnavailableAt(source, input.atSequence)) {
      return yield* NoSnapshot.make({ runId: input.runId, atSequence: input.atSequence })
    }
    const selection = yield* selectedOperations(state, input.runId, input.atSequence, input.substitute)
    const targetSessionId = `${source.message.sessionId}:fork:${input.newRunId}`
    const events = copiedEvents({
      run: source,
      runId: input.newRunId,
      sessionId: targetSessionId,
      atSequence: input.atSequence,
    })
    yield* Effect.forEach(
      events,
      (event) => validatePayload({ value: event, boundary: "fork event", limit: maximumEventBytes }),
      { discard: true },
    )
    const run: Types.Mutable<StoredRun> = copiedRun({
      source,
      runId: input.newRunId,
      sessionId: targetSessionId,
      atSequence: input.atSequence,
      events,
    })
    if (selection.target?.checkpoint !== undefined) {
      run.checkpoint = forkCheckpoint(selection.target.checkpoint, input.runId, input.newRunId, targetSessionId)
    }
    if (run.checkpoint !== undefined) run.checkpoint = withCurrentBudget(run.checkpoint, allocation.child.remaining)
    const programCheckpoint = yield* programBranchCheckpoint(state, source, input.atSequence, input.newRunId)
    const program = yield* forkProgram(state, source, input.newRunId, programCheckpoint, input.programBudget)
    if (programCheckpoint !== undefined) run.checkpoint = programCheckpoint
    const ownerAfterReservation =
      owner.checkpoint === undefined
        ? owner
        : { ...owner, checkpoint: withCurrentBudget(owner.checkpoint, allocation.parent.remaining) }
    const runs = new Map(state.runs).set(owner.runId, ownerAfterReservation).set(input.newRunId, run)
    const sessions = new Map(state.sessions)
    const sourceSession = sessions.get(source.message.sessionId)
    const initialSession =
      sourceSession === undefined
        ? undefined
        : copiedSession({
            session: sourceSession,
            leaf: leafAt(events),
            checkpoint: run.checkpoint,
            initialComponents: source.initialSessionComponents,
          })
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
      treeRoots: addTreeRoot({ treeRoots: state.treeRoots, runId: input.newRunId, events }),
    }
    const boundary = {
      _tag: "RunForked" as const,
      sourceRunId: input.runId,
      allocationRunId: owner.runId,
      forkRunId: input.newRunId,
      atSequence: input.atSequence,
      budget: allocation.child.allocation,
    }
    if (input.programBudget !== undefined) Object.assign(boundary, { programBudget: input.programBudget })
    const [, reserved] = yield* appendEvent(next, owner.runId, (base) => ({ ...base, ...boundary, role: "source" }))
    const [, allocated] = yield* appendEvent(reserved, input.newRunId, (base) => ({
      ...base,
      ...boundary,
      role: "target",
    }))
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
    next = yield* publishConversation({ previous: state, next, sessionId: run.message.sessionId }).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    return [{ runId: input.newRunId, messageId: run.message.id, acceptedSequence: 0, duplicate: false }, next] as const
  })
type ForkEffect = ReturnType<typeof forkEffect>
export const fork: {
  (input: ForkRunInput): (state: RuntimeState) => ForkEffect
  (state: RuntimeState, input: ForkRunInput): ForkEffect
} = Function.dual(2, forkEffect)

const rewindEffect = (state: RuntimeState, input: RewindRunInput) =>
  Effect.gen(function* () {
    const { source, owner, reservation, available, baseline } = yield* reserveRewindAllocation({ state, input })
    yield* requireConversationalSlot({ state, run: source })
    yield* validateSequence(source, input.toSequence)
    if (snapshotUnavailableAt(source, input.toSequence)) {
      return yield* NoSnapshot.make({ runId: input.runId, atSequence: input.toSequence })
    }
    const selection = {
      source: sourceOperations(state, input.runId),
      cutoff: source.lastSequence,
    }
    const branchSessionId = `${source.message.sessionId}:fork:${input.branchRunId}`
    const branchEvents = copiedEvents({
      run: source,
      runId: input.branchRunId,
      sessionId: branchSessionId,
      atSequence: source.lastSequence,
      includeTerminal: true,
    })
    yield* Effect.forEach(
      branchEvents,
      (event) => validatePayload({ value: event, boundary: "fork event", limit: maximumEventBytes }),
      {
        discard: true,
      },
    )
    const branch: Types.Mutable<StoredRun> = copiedRun({
      source,
      runId: input.branchRunId,
      sessionId: branchSessionId,
      atSequence: input.toSequence,
      events: branchEvents,
    })
    branch.status = "queued"
    if (source.checkpoint !== undefined)
      branch.checkpoint = withCurrentBudget(
        forkCheckpoint(source.checkpoint, input.runId, input.branchRunId, branchSessionId),
        { tokens: 0, usd: 0, duration: 0, toolCalls: 0, children: 0 },
      )
    const events = copiedEvents({
      run: source,
      runId: input.runId,
      sessionId: source.message.sessionId,
      atSequence: input.toSequence,
    })
    const rewoundBase = copiedRun({
      source,
      runId: input.runId,
      sessionId: source.message.sessionId,
      atSequence: input.toSequence,
      events,
    })
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
      state,
      source,
      input.toSequence,
      rewound.operationNamespace!,
    )
    if (programCheckpoint !== undefined) rewound.checkpoint = programCheckpoint
    restoreRewoundOrigin({ source, rewound })
    const runs = new Map(state.runs).set(input.branchRunId, branch).set(input.runId, rewound)
    if (reservation !== undefined) {
      rewound.childReadiness = "ready"
      runs.set(source.runId, rewound)
      runs.set(
        owner.runId,
        owner.checkpoint === undefined
          ? owner
          : { ...owner, checkpoint: withCurrentBudget(owner.checkpoint, reservation.parent.remaining) },
      )
    }
    const sessions = new Map(state.sessions)
    const sourceSession = sessions.get(source.message.sessionId)
    const initialBranchSession =
      sourceSession === undefined
        ? undefined
        : copiedSession({
            session: sourceSession,
            leaf: leafAt(branchEvents),
            checkpoint: branch.checkpoint,
            initialComponents: source.initialSessionComponents,
          })
    if (sourceSession !== undefined) {
      sessions.set(
        source.message.sessionId,
        yield* rewoundSession({
          session: sourceSession,
          leaf: leafAt(events),
          checkpoint: rewound.checkpoint,
          initialComponents: source.initialSessionComponents,
        }),
      )
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
      treeRoots: addTreeRoot({ treeRoots: state.treeRoots, runId: input.branchRunId, events: branch.events }),
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
    const [, closed] = yield* appendEvent(
      archived,
      input.branchRunId,
      (base) => ({
        ...base,
        _tag: "RunCancelled",
        reason: "Historical branch retained by rewind; no execution allocation",
      }),
      "cancelled",
    )
    const [, retained] = yield* appendEvent(closed, input.runId, (base) => {
      const event = {
        ...base,
        _tag: "RunRewound" as const,
        toSequence: input.toSequence,
        branchRunId: input.branchRunId,
      }
      if (reservation !== undefined)
        Object.assign(event, {
          allocation: { runId: owner.runId, budget: reservation.child.allocation, baseline: baseline! },
        })
      return event
    })
    next = yield* publishConversation({ previous: state, next: retained, sessionId: source.message.sessionId }).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    return [undefined, next] as const
  })
type RewindEffect = ReturnType<typeof rewindEffect>
export const rewind: {
  (input: RewindRunInput): (state: RuntimeState) => RewindEffect
  (state: RuntimeState, input: RewindRunInput): RewindEffect
} = Function.dual(2, rewindEffect)
