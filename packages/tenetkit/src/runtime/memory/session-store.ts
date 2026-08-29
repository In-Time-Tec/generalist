import { Effect, Schema, SynchronizedRef } from "effect"
import { Session } from "../../core/index.js"
import type { InterruptedSessionEntry } from "../execution/agent/event.js"
import { RuntimeUnavailable } from "../errors.js"
import type { CompletedSessionEntry } from "../execution/model-response/commit.js"
import { handoffPayload, type HandoffSessionEntry } from "../session/handoff.js"
import { terminalToolMessage, type RunTerminalOutcome } from "../session/tool-results.js"
import type { MemorySession, MemoryState } from "./state.js"
import type { ExecutionClaim, SessionReader } from "../run/store.js"
import { StaleSessionClaim } from "../sql/errors.js"

type Entry = Session.Entry

const emptySession = (): MemorySession => ({
  entries: new Map(),
  order: [],
  leaf: null,
  counter: 0,
  writerEpoch: 0n,
})
const payloadEquivalence = Schema.toEquivalence(Session.EntryPayload)
const storeError = (message: string) => Session.SessionStoreError.make({ message })
const conflict = (reason: Session.SessionConflict["reason"], message: string) =>
  Session.SessionConflict.make({ reason, message })

const entryFromInput = (input: Session.AppendInput, id: string, parentId: string | null): Entry => ({
  ...input,
  id,
  parentId,
})

const pathTo = (session: MemorySession, leaf: string | null): ReadonlyArray<Entry> | Session.SessionStoreError => {
  if (leaf === null) return []
  const entries: Array<Entry> = []
  let cursor: string | null = leaf
  while (cursor !== null) {
    if (entries.length > session.order.length) return storeError(`Session path for leaf ${leaf} contains a cycle`)
    const entry: Entry | undefined = session.entries.get(cursor)
    if (entry === undefined) return storeError(`Session entry ${cursor} does not exist`)
    entries.push(entry)
    cursor = entry.parentId
  }
  return entries.toReversed()
}

const onActivePath = (session: MemorySession, id: string): boolean => {
  const path = pathTo(session, session.leaf)
  return !Schema.is(Session.SessionStoreError)(path) && path.some((entry) => entry.id === id)
}

const samePayload = (entry: Entry, input: Session.AppendInput): boolean => payloadEquivalence(entry, input)

const isAppendSuccess = (
  value: readonly [Entry, MemorySession] | Session.SessionConflict,
): value is readonly [Entry, MemorySession] => Array.isArray(value)

const existingAppend = (
  session: MemorySession,
  input: Session.AppendInput,
  options: Session.AppendOptions,
): readonly [Entry, MemorySession] | Session.SessionConflict | undefined => {
  if (options.id === undefined) return undefined
  const existing = session.entries.get(options.id)
  if (existing === undefined) return undefined
  if (existing.parentId !== options.expectedLeafId || !samePayload(existing, input)) {
    return conflict("entry-id-reused", `Session entry id ${options.id} was reused with different parent or content`)
  }
  if (!onActivePath(session, existing.id)) {
    return conflict("stale-leaf", `Session entry id ${options.id} is not on the active path`)
  }
  return [existing, session]
}

const append = (
  session: MemorySession,
  input: Session.AppendInput,
  options?: Session.AppendOptions,
): readonly [Entry, MemorySession] | Session.SessionConflict => {
  const existing = options === undefined ? undefined : existingAppend(session, input, options)
  if (existing !== undefined) return existing
  if (options?.expectedLeafId !== undefined && options.expectedLeafId !== session.leaf) {
    return conflict(
      "stale-leaf",
      `Expected Session leaf ${String(options.expectedLeafId)} but found ${String(session.leaf)}`,
    )
  }
  let generated = session.counter
  if (options?.id === undefined) while (session.entries.has(String(generated))) generated += 1
  const id = options?.id ?? String(generated)
  const entry = entryFromInput(input, id, session.leaf)
  const entries = new Map(session.entries).set(id, entry)
  return [
    entry,
    {
      ...session,
      entries,
      order: [...session.order, id],
      leaf: id,
      counter: options?.id === undefined ? generated + 1 : session.counter,
    },
  ]
}

const completedPayload = (input: CompletedSessionEntry): Session.AppendInput => ({
  _tag: "ModelResponse",
  content: input.content,
  metadata: { modelResponseDigest: input.digest },
})

export const verifyCompletedSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: CompletedSessionEntry
}): Effect.Effect<void, Session.SessionConflict> => {
  const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
  const existing = session.entries.get(input.entry.entryId)
  if (
    existing === undefined ||
    existing.parentId !== input.entry.parentId ||
    !samePayload(existing, completedPayload(input.entry))
  ) {
    return Effect.fail(
      conflict("entry-id-reused", `Session entry id ${input.entry.entryId} does not match the completed response`),
    )
  }
  if (!onActivePath(session, input.entry.entryId)) {
    return Effect.fail(conflict("stale-leaf", `Session entry id ${input.entry.entryId} is not on the active path`))
  }
  return Effect.void
}

/** Append or verify one exact completed assistant projection at its durable input-prefix leaf. */
export const appendCompletedSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: CompletedSessionEntry
}): Effect.Effect<MemoryState, Session.SessionConflict | Session.SessionStoreError> =>
  Effect.gen(function* () {
    const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
    const payload = completedPayload(input.entry)
    const existing = session.entries.get(input.entry.entryId)
    let nextSession: MemorySession
    if (existing !== undefined) {
      yield* verifyCompletedSessionEntry(input)
      nextSession = session
    } else {
      const result = append(session, payload, {
        id: input.entry.entryId,
        expectedLeafId: input.entry.parentId,
      })
      if (!isAppendSuccess(result)) return yield* result
      nextSession = result[1]
    }
    return {
      ...input.state,
      sessions: new Map(input.state.sessions).set(input.entry.sessionId, nextSession),
    }
  })

export const verifyHandoffSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: HandoffSessionEntry
}): Effect.Effect<void, Session.SessionConflict> => {
  const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
  const existing = session.entries.get(input.entry.entryId)
  if (
    existing === undefined ||
    existing.parentId !== input.entry.parentId ||
    !samePayload(existing, handoffPayload(input.entry))
  ) {
    return Effect.fail(
      conflict("entry-id-reused", `Session entry id ${input.entry.entryId} does not match the handoff projection`),
    )
  }
  if (!onActivePath(session, input.entry.entryId)) {
    return Effect.fail(conflict("stale-leaf", `Session entry id ${input.entry.entryId} is not on the active path`))
  }
  return Effect.void
}

export const appendHandoffSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: HandoffSessionEntry
}): Effect.Effect<MemoryState, Session.SessionConflict | Session.SessionStoreError> =>
  Effect.gen(function* () {
    const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
    const existing = session.entries.get(input.entry.entryId)
    let nextSession: MemorySession
    if (existing !== undefined) {
      yield* verifyHandoffSessionEntry(input)
      nextSession = session
    } else {
      const result = append(session, handoffPayload(input.entry), {
        id: input.entry.entryId,
        expectedLeafId: input.entry.parentId,
      })
      if (!isAppendSuccess(result)) return yield* result
      nextSession = result[1]
    }
    return {
      ...input.state,
      sessions: new Map(input.state.sessions).set(input.entry.sessionId, nextSession),
    }
  })

const interruptedPayload = (input: InterruptedSessionEntry): Session.AppendInput => ({
  _tag: "ModelResponse",
  content: input.content,
  metadata: { interruptionDigest: input.digest },
})

export const verifyInterruptedSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: InterruptedSessionEntry
}): Effect.Effect<void, Session.SessionConflict> => {
  const { state, entry: interrupted } = input
  const session = state.sessions.get(interrupted.sessionId) ?? emptySession()
  const existing = session.entries.get(interrupted.entryId)
  if (
    existing === undefined ||
    existing.parentId !== interrupted.parentId ||
    !samePayload(existing, interruptedPayload(interrupted))
  ) {
    return Effect.fail(
      conflict("entry-id-reused", `Session entry id ${interrupted.entryId} does not match the interrupted response`),
    )
  }
  if (!onActivePath(session, interrupted.entryId)) {
    return Effect.fail(conflict("stale-leaf", `Session entry id ${interrupted.entryId} is not on the active path`))
  }
  return Effect.void
}

export const appendInterruptedSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: InterruptedSessionEntry
}): Effect.Effect<MemoryState, Session.SessionConflict | Session.SessionStoreError> =>
  Effect.gen(function* () {
    const { state, entry: interrupted } = input
    const session = state.sessions.get(interrupted.sessionId) ?? emptySession()
    const payload = interruptedPayload(interrupted)
    const existing = session.entries.get(interrupted.entryId)
    let nextSession: MemorySession
    if (existing !== undefined) {
      if (existing.parentId !== interrupted.parentId || !samePayload(existing, payload)) {
        return yield* conflict(
          "entry-id-reused",
          `Session entry id ${interrupted.entryId} was reused with different interrupted response content`,
        )
      }
      if (!onActivePath(session, interrupted.entryId)) {
        return yield* conflict("stale-leaf", `Session entry id ${interrupted.entryId} is not on the active path`)
      }
      nextSession = session
    } else {
      const result = append(session, payload, { id: interrupted.entryId, expectedLeafId: interrupted.parentId })
      if (!isAppendSuccess(result)) return yield* result
      nextSession = result[1]
    }
    return { ...state, sessions: new Map(state.sessions).set(interrupted.sessionId, nextSession) }
  })

const writerBelongsToRun = (
  session: MemorySession,
  run: { readonly runId: string; readonly ownerId?: string; readonly attemptFence: number },
) =>
  session.writer === undefined ||
  (session.writer.runId === run.runId &&
    session.writer.ownerId === run.ownerId &&
    session.writer.runAttemptFence === run.attemptFence)

export const appendTerminalToolResults = (input: {
  readonly state: MemoryState
  readonly runId: string
  readonly terminal: RunTerminalOutcome
}): Effect.Effect<MemoryState, RuntimeUnavailable> =>
  Effect.gen(function* () {
    const run = input.state.runs.get(input.runId)
    if (run === undefined) return input.state
    const initialSession = input.state.sessions.get(run.message.sessionId)
    if (initialSession === undefined) return input.state
    let state = input.state
    let session = initialSession
    let shortLived = false
    const ownsSession = writerBelongsToRun(session, run)
    if (session.writer === undefined) {
      const writerEpoch = session.writerEpoch + 1n
      session = {
        ...session,
        writerEpoch,
        writer: {
          runId: run.runId,
          ownerId: `${run.runId}:terminal:${run.lastSequence + 1}`,
          runAttemptFence: run.attemptFence,
        },
      }
      state = { ...state, sessions: new Map(state.sessions).set(run.message.sessionId, session) }
      shortLived = true
    }
    const finish = (next: MemoryState): MemoryState => {
      if (!shortLived) return next
      const current = next.sessions.get(run.message.sessionId)
      if (current === undefined || current.writerEpoch !== session.writerEpoch) return next
      const { writer: _, ...revoked } = current
      return { ...next, sessions: new Map(next.sessions).set(run.message.sessionId, revoked) }
    }
    const id = `${input.runId}:terminal-tool-results`
    const existing = session.entries.get(id)
    const parentId = existing === undefined ? session.leaf : existing.parentId
    const path = parentId === null ? [] : pathTo(session, parentId)
    if (Schema.is(Session.SessionStoreError)(path)) {
      return yield* RuntimeUnavailable.make({ message: path.message })
    }
    const operations = new Map(
      [...state.operations.values()]
        .filter((operation) => operation.runId === input.runId)
        .map((operation) => [operation.operationId, operation] as const),
    )
    const message = yield* terminalToolMessage({
      runId: input.runId,
      path,
      events: run.events,
      operations: [...operations.values()],
      terminal: input.terminal,
    })
    if (message === undefined) return finish(state)
    if (!ownsSession) {
      return yield* RuntimeUnavailable.make({
        message: `Run ${run.runId} does not own its terminal Session projection`,
      })
    }
    const payload = {
      _tag: "Message" as const,
      message,
      metadata: { terminalRunId: input.runId, terminalTag: input.terminal._tag },
    }
    if (existing !== undefined) {
      if (!samePayload(existing, payload) || !onActivePath(session, existing.id)) {
        return yield* RuntimeUnavailable.make({ message: `Terminal Session entry ${id} conflicts with its retry` })
      }
      return finish(state)
    }
    const result = append(session, payload, { id, expectedLeafId: session.leaf })
    if (!isAppendSuccess(result)) {
      return yield* RuntimeUnavailable.make({ message: result.message })
    }
    return finish({ ...state, sessions: new Map(state.sessions).set(run.message.sessionId, result[1]) })
  })

const updateSession = <A, E>(
  stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
  sessionId: string,
  transition: (session: MemorySession) => Effect.Effect<readonly [A, MemorySession], E>,
) =>
  SynchronizedRef.modifyEffect(stateRef, (state) =>
    transition(state.sessions.get(sessionId) ?? emptySession()).pipe(
      Effect.map(([value, session]) => [
        value,
        { ...state, sessions: new Map(state.sessions).set(sessionId, session) },
      ]),
    ),
  )

const requireClaim = (session: MemorySession, claim: ExecutionClaim) =>
  session.writerEpoch.toString() === claim.session.epoch &&
  claim.session.runId === claim.runId &&
  claim.session.ownerId === claim.ownerId &&
  claim.session.runAttemptFence === claim.attemptFence &&
  session.writer?.runId === claim.runId &&
  session.writer.ownerId === claim.ownerId &&
  session.writer.runAttemptFence === claim.attemptFence
    ? Effect.void
    : Effect.fail(StaleSessionClaim.make(claim.session))

const claimedUpdate = <A, E>(
  stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
  claim: ExecutionClaim,
  transition: (session: MemorySession) => Effect.Effect<readonly [A, MemorySession], E>,
) =>
  updateSession(stateRef, claim.session.sessionId, (session) =>
    requireClaim(session, claim).pipe(Effect.andThen(transition(session))),
  ).pipe(
    Effect.mapError((error) =>
      Schema.is(StaleSessionClaim)(error) ? storeError("Session write claim is stale") : error,
    ),
  )

export const reader = (config: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<MemoryState>
  readonly sessionId: string
}): SessionReader => ({
  path: (leaf) =>
    SynchronizedRef.get(config.stateRef).pipe(
      Effect.flatMap((state) => {
        const session = state.sessions.get(config.sessionId) ?? emptySession()
        const path = pathTo(session, leaf ?? session.leaf)
        return Schema.is(Session.SessionStoreError)(path) ? Effect.fail(path) : Effect.succeed(path)
      }),
    ),
  leaf: SynchronizedRef.get(config.stateRef).pipe(
    Effect.map((state) => state.sessions.get(config.sessionId)?.leaf ?? null),
  ),
})

export const claimedStore = (config: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<MemoryState>
  readonly claim: ExecutionClaim
}): Session.Interface => {
  const { stateRef, claim } = config
  const sessionId = claim.session.sessionId
  return {
    reserveEntryId: claimedUpdate(stateRef, claim, (session) => {
      let counter = session.counter
      while (session.entries.has(String(counter))) counter += 1
      return Effect.succeed([String(counter), { ...session, counter: counter + 1 }] as const)
    }),
    append: (input, options) =>
      claimedUpdate<Session.Entry, Session.SessionConflict>(stateRef, claim, (session) => {
        const result = append(session, input, options)
        return isAppendSuccess(result) ? Effect.succeed(result) : Effect.fail(result)
      }),
    appendCheckpoint: (prepared) =>
      claimedUpdate<Session.CheckpointAppend, Session.SessionConflict>(stateRef, claim, (session) =>
        Effect.gen(function* () {
          if (prepared.compactionCommit !== undefined && prepared.compactionCommit.checkpointId !== prepared.id) {
            return yield* conflict("checkpoint-id-reused", "Compaction commit checkpoint identity diverges")
          }
          const existing = session.entries.get(prepared.id)
          if (existing !== undefined) {
            if (existing._tag !== "Compaction" || !Session.checkpointMatches(existing, prepared)) {
              return yield* conflict(
                "checkpoint-id-reused",
                `Session checkpoint id ${prepared.id} was reused with different content`,
              )
            }
            if (!onActivePath(session, prepared.id)) {
              return yield* conflict("checkpoint-not-on-active-path", `Session checkpoint ${prepared.id} is not active`)
            }
            return [
              {
                _tag: "AlreadyPresent" as const,
                checkpoint: existing,
                leafId: session.leaf ?? existing.id,
              } satisfies Session.CheckpointAppend,
              session,
            ] as const
          }
          if (prepared.parentId !== session.leaf) {
            return yield* conflict(
              "stale-leaf",
              `Expected Session leaf ${String(prepared.parentId)} but found ${String(session.leaf)}`,
            )
          }
          const checkpoint: Session.CompactionEntry = {
            _tag: "Compaction",
            id: prepared.id,
            parentId: prepared.parentId,
            projectedHistory: prepared.projectedHistory,
            telemetry: prepared.telemetry,
          }
          if (prepared.compactionCommit !== undefined)
            Object.assign(checkpoint, { compactionCommit: prepared.compactionCommit })
          if (prepared.summary !== undefined) Object.assign(checkpoint, { summary: prepared.summary })
          const next = {
            ...session,
            entries: new Map(session.entries).set(checkpoint.id, checkpoint),
            order: [...session.order, checkpoint.id],
            leaf: checkpoint.id,
          }
          return [
            { _tag: "Appended" as const, checkpoint, leafId: checkpoint.id } satisfies Session.CheckpointAppend,
            next,
          ] as const
        }),
      ),
    path: reader({ stateRef, sessionId }).path,
    setLeaf: (id) =>
      claimedUpdate(stateRef, claim, (session) =>
        id !== null && !session.entries.has(id)
          ? Effect.fail(storeError(`Session entry ${id} does not exist`))
          : Effect.succeed([undefined, { ...session, leaf: id }] as const),
      ),
    leaf: reader({ stateRef, sessionId }).leaf,
  }
}
