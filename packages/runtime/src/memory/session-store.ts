import { Effect, Schema, SynchronizedRef } from "effect"
import { Session } from "@batonfx/core"
import type { InterruptedSessionEntry } from "../agent-event.js"
import type { MemorySession, MemoryState } from "./state.js"

type Entry = Session.Entry

const emptySession = (): MemorySession => ({ entries: new Map(), order: [], leaf: null, counter: 0 })
const payloadEquivalence = Schema.toEquivalence(Session.EntryPayload)
const storeError = (message: string) => Session.SessionStoreError.make({ message })
const conflict = (reason: Session.SessionConflict["reason"], message: string) =>
  Session.SessionConflict.make({ reason, message })

const entryFromInput = (input: Session.AppendInput, id: string, parentId: string | null): Entry =>
  ({ ...input, id, parentId }) as Entry

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

const samePayload = (entry: Entry, input: Session.AppendInput): boolean =>
  payloadEquivalence(entry as Session.EntryPayload, input as Session.EntryPayload)

const isAppendSuccess = (
  value: readonly [Entry, MemorySession] | Session.SessionConflict,
): value is readonly [Entry, MemorySession] => Array.isArray(value)

const append = (
  session: MemorySession,
  input: Session.AppendInput,
  options?: Session.AppendOptions,
): readonly [Entry, MemorySession] | Session.SessionConflict => {
  if (options?.id !== undefined) {
    const existing = session.entries.get(options.id)
    if (existing !== undefined) {
      if (existing.parentId !== options.expectedLeafId || !samePayload(existing, input)) {
        return conflict("entry-id-reused", `Session entry id ${options.id} was reused with different parent or content`)
      }
      if (!onActivePath(session, existing.id)) {
        return conflict("stale-leaf", `Session entry id ${options.id} is not on the active path`)
      }
      return [existing, session]
    }
  }
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
      entries,
      order: [...session.order, id],
      leaf: id,
      counter: options?.id === undefined ? generated + 1 : session.counter,
    },
  ]
}

const interruptedPayload = (input: InterruptedSessionEntry): Session.AppendInput => ({
  _tag: "Message",
  message: input.message,
  metadata: { interruptionDigest: input.digest },
})

export const verifyInterruptedSessionEntry = (input: {
  readonly state: MemoryState
  readonly entry: InterruptedSessionEntry
}): Effect.Effect<void, Session.SessionConflict> => {
  const { state, entry: interrupted } = input
  const session = state.sessions.get(interrupted.sessionId) ?? emptySession()
  const existing = session.entries.get(interrupted.entryId)
  if (existing === undefined || !samePayload(existing, interruptedPayload(interrupted))) {
    return Effect.fail(
      conflict("entry-id-reused", `Session entry id ${interrupted.entryId} does not match the interrupted response`),
    )
  }
  if (!onActivePath(session, interrupted.entryId)) {
    return Effect.fail(conflict("stale-leaf", `Session entry id ${interrupted.entryId} is not on the active path`))
  }
  return Effect.void
}

/** Append or verify the stable interrupted assistant projection at the Session's current leaf. */
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
      if (!samePayload(existing, payload)) {
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
      const result = append(session, payload, { id: interrupted.entryId, expectedLeafId: session.leaf })
      if (!isAppendSuccess(result)) return yield* result
      nextSession = result[1]
    }
    return { ...state, sessions: new Map(state.sessions).set(interrupted.sessionId, nextSession) }
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

export const makeMemorySessionStore = (config: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<MemoryState>
  readonly sessionId: string
}): Session.Interface => {
  const { stateRef, sessionId } = config
  return Session.SessionStore.of({
    reserveEntryId: updateSession(stateRef, sessionId, (session) => {
      let counter = session.counter
      while (session.entries.has(String(counter))) counter += 1
      return Effect.succeed([String(counter), { ...session, counter: counter + 1 }] as const)
    }),
    append: (input, options) =>
      updateSession<Session.Entry, Session.SessionConflict>(stateRef, sessionId, (session) => {
        const result = append(session, input, options)
        return isAppendSuccess(result) ? Effect.succeed(result) : Effect.fail(result)
      }),
    appendCheckpoint: (prepared) =>
      updateSession<Session.CheckpointAppend, Session.SessionConflict>(stateRef, sessionId, (session) =>
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
            ...(prepared.compactionCommit === undefined ? {} : { compactionCommit: prepared.compactionCommit }),
            ...(prepared.summary === undefined ? {} : { summary: prepared.summary }),
          }
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
    path: (leaf) =>
      SynchronizedRef.get(stateRef).pipe(
        Effect.flatMap((state) => {
          const session = state.sessions.get(sessionId) ?? emptySession()
          const path = pathTo(session, leaf ?? session.leaf)
          return Schema.is(Session.SessionStoreError)(path) ? Effect.fail(path) : Effect.succeed(path)
        }),
      ),
    setLeaf: (id) =>
      updateSession(stateRef, sessionId, (session) =>
        id !== null && !session.entries.has(id)
          ? Effect.fail(storeError(`Session entry ${id} does not exist`))
          : Effect.succeed([undefined, { ...session, leaf: id }] as const),
      ),
    leaf: SynchronizedRef.get(stateRef).pipe(Effect.map((state) => state.sessions.get(sessionId)?.leaf ?? null)),
  })
}
