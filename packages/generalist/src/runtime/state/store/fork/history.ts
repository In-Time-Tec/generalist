import { Effect, Types } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import { eventIdFor, type RunEvent } from "../../../run/event.js"
import { ForkCheckpoint } from "../../../execution/recovery/fork-checkpoint.js"
import type { RuntimeSession, RuntimeState, StoredRun } from "../../projection.js"

const { forkCheckpoint, forkOperationKey } = ForkCheckpoint

export const copiedEvents = ({
  run,
  runId,
  sessionId,
  atSequence,
  includeTerminal = false,
}: {
  readonly run: StoredRun
  readonly runId: string
  readonly sessionId: string
  readonly atSequence: number
  readonly includeTerminal?: boolean
}): ReadonlyArray<RunEvent> =>
  run.events
    .filter(
      (event) =>
        event.sequence <= atSequence &&
        (includeTerminal ||
          (event._tag !== "RunCompleted" && event._tag !== "RunFailed" && event._tag !== "RunCancelled")),
    )
    .map((event) => {
      const remapped =
        runId === run.runId ? event : (({ parentRunId: _parentRunId, ...withoutParent }) => withoutParent)(event)
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

export const leafAt = (events: ReadonlyArray<RunEvent>): string | null => {
  const response = events.findLast(
    (event): event is Extract<RunEvent, { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }> =>
      event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted",
  )
  return response?.sessionEntryId ?? null
}

export const copiedSession = ({
  session,
  leaf,
}: {
  readonly session: RuntimeSession
  readonly leaf: string | null
}): RuntimeSession => {
  const copy: Types.Mutable<RuntimeSession> = {
    entries: new Map(session.entries),
    order: [...session.order],
    leaf,
    counter: session.counter,
    writerEpoch: 0n,
  }
  return copy
}

export const rewoundSession = ({
  session,
  leaf,
}: {
  readonly session: RuntimeSession
  readonly leaf: string | null
}) => {
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
  if (session.family !== undefined) copy.family = session.family
  return Effect.succeed(copy)
}

export const copiedRun = ({
  source,
  runId,
  sessionId,
  atSequence,
  events,
}: {
  readonly source: StoredRun
  readonly runId: string
  readonly sessionId: string
  readonly atSequence: number
  readonly events: ReadonlyArray<RunEvent>
}): StoredRun => {
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

export const addTreeRoot = ({
  treeRoots,
  runId,
  events,
}: {
  readonly treeRoots: RuntimeState["treeRoots"]
  readonly runId: string
  readonly events: ReadonlyArray<RunEvent>
}) => {
  const roots = new Map(treeRoots)
  roots.set(runId, {
    earliestPosition: 0,
    lastPosition: events.length - 1,
    events: [],
    subscribers: new Map(),
  })
  return roots
}

export const restoreRewoundOrigin = ({
  source,
  rewound,
}: {
  readonly source: StoredRun
  readonly rewound: Types.Mutable<StoredRun>
}): void => {
  if (source.forkedFrom !== undefined) rewound.forkedFrom = source.forkedFrom
  else delete rewound.forkedFrom
  if (source.forkSequence !== undefined) rewound.forkSequence = source.forkSequence
  else delete rewound.forkSequence
  if (source.parentRunId !== undefined) rewound.parentRunId = source.parentRunId
  if (source.invocationId !== undefined) rewound.invocationId = source.invocationId
  if (source.childReadiness !== undefined) rewound.childReadiness = source.childReadiness
}
