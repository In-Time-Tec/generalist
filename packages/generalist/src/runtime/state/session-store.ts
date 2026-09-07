import type { PreparedObservation } from "./observation.js"
import { Effect, Schema } from "effect"
import type { ModifyState } from "../../durability/internal/runtime.js"
import { DurabilityFailure } from "../../durability/errors.js"
import type { Definition } from "../../durability/internal/runtime-command.js"
import { commands } from "../../durability/internal/runtime-state/session-command.js"
import { requireExecutionClaim } from "./store/claim.js"
import {
  type AppendInput,
  type AppendOptions,
  type CheckpointAppend,
  type CompactionEntry,
  type Entry,
  EntryPayload,
  type SessionStore,
  SessionConflict,
  SessionStoreError,
  checkpointMatches,
} from "../../core/context/session.js"
import type { InterruptedSessionEntry } from "../execution/agent/event.js"
import { RuntimeUnavailable } from "../errors.js"
import { validate as validatePayload } from "../execution/payload/index.js"
import type { CompletedSessionEntry } from "../execution/model-response/commit.js"
import { handoffPayload, type HandoffSessionEntry } from "../session/handoff.js"
import { prepareSessionAppendInput } from "../../core/model/response/persistence.js"
import { terminalToolMessage, type RunTerminalOutcome } from "../session/tool-results.js"
import { emptySession, type RuntimeSession, type RuntimeState } from "./projection.js"
import type { ExecutionClaim } from "../run/store.js"
import { StaleClaim, StaleSessionClaim } from "../run/ownership-errors.js"
import { reader, SessionReads, sessionStorageFailure } from "./session-reader.js"
import { publishConversation } from "./store/host-session/conversation.js"

const { pathTo } = SessionReads

const payloadEquivalence = Schema.toEquivalence(EntryPayload)
const storeError = (message: string) => SessionStoreError.make({ message })
const conflict = (reason: SessionConflict["reason"], message: string) => SessionConflict.make({ reason, message })
const updateSession = (state: RuntimeState, sessionId: string, session: RuntimeSession) =>
  publishConversation({
    previous: state,
    sessionId,
    next: { ...state, sessions: new Map(state.sessions).set(sessionId, session) },
  })

const entryFromInput = (input: AppendInput, id: string, parentId: string | null): Entry => ({
  ...input,
  id,
  parentId,
})

const onActivePath = (session: RuntimeSession, id: string): boolean => {
  const path = pathTo(session, session.leaf)
  return !Schema.is(SessionStoreError)(path) && path.some((entry) => entry.id === id)
}

const samePayload = (entry: Entry, input: AppendInput): boolean => payloadEquivalence(entry, input)

const nextCounter = (counter: number, id: string): number => {
  const numeric = Number(id)
  return Number.isSafeInteger(numeric) && numeric >= 0 && String(numeric) === id
    ? Math.max(counter + 1, numeric + 1)
    : counter + 1
}

const isAppendSuccess = (
  value: readonly [Entry, RuntimeSession] | SessionConflict,
): value is readonly [Entry, RuntimeSession] => Array.isArray(value)

const existingAppend = (
  session: RuntimeSession,
  input: AppendInput,
  options: AppendOptions,
): readonly [Entry, RuntimeSession] | SessionConflict | undefined => {
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
  session: RuntimeSession,
  input: AppendInput,
  options: AppendOptions,
): readonly [Entry, RuntimeSession] | SessionConflict => {
  const existing = existingAppend(session, input, options)
  if (existing !== undefined) return existing
  if (options.expectedLeafId !== undefined && options.expectedLeafId !== session.leaf) {
    return conflict(
      "stale-leaf",
      `Expected Session leaf ${String(options.expectedLeafId)} but found ${String(session.leaf)}`,
    )
  }
  const id = options.id ?? String(session.counter)
  const entry = entryFromInput(input, id, session.leaf)
  const entries = new Map(session.entries).set(id, entry)
  return [
    entry,
    {
      ...session,
      entries,
      order: [...session.order, id],
      leaf: id,
      counter: nextCounter(session.counter, id),
    },
  ]
}

const completedPayload = (input: CompletedSessionEntry): AppendInput => ({
  _tag: "ModelResponse",
  content: input.content,
  metadata: { modelResponseDigest: input.digest },
})

export const verifyCompletedSessionEntry = (input: {
  readonly state: RuntimeState
  readonly entry: CompletedSessionEntry
}): Effect.Effect<void, SessionConflict> => {
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
  readonly state: RuntimeState
  readonly entry: CompletedSessionEntry
}): Effect.Effect<RuntimeState, SessionConflict | SessionStoreError, PreparedObservation> =>
  Effect.gen(function* () {
    const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
    const payload = completedPayload(input.entry)
    const existing = session.entries.get(input.entry.entryId)
    let nextSession: RuntimeSession
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
    return yield* updateSession(input.state, input.entry.sessionId, nextSession)
  })

export const verifyHandoffSessionEntry = (input: {
  readonly state: RuntimeState
  readonly entry: HandoffSessionEntry
}): Effect.Effect<void, SessionConflict> => {
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
  readonly state: RuntimeState
  readonly entry: HandoffSessionEntry
}): Effect.Effect<RuntimeState, SessionConflict | SessionStoreError, PreparedObservation> =>
  Effect.gen(function* () {
    const session = input.state.sessions.get(input.entry.sessionId) ?? emptySession()
    const existing = session.entries.get(input.entry.entryId)
    let nextSession: RuntimeSession
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
    return yield* updateSession(input.state, input.entry.sessionId, nextSession)
  })

const interruptedPayload = (input: InterruptedSessionEntry): AppendInput => ({
  _tag: "ModelResponse",
  content: input.content,
  metadata: { interruptionDigest: input.digest },
})

export const verifyInterruptedSessionEntry = (input: {
  readonly state: RuntimeState
  readonly entry: InterruptedSessionEntry
}): Effect.Effect<void, SessionConflict> => {
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
  readonly state: RuntimeState
  readonly entry: InterruptedSessionEntry
}): Effect.Effect<RuntimeState, SessionConflict | SessionStoreError, PreparedObservation> =>
  Effect.gen(function* () {
    const { state, entry: interrupted } = input
    const session = state.sessions.get(interrupted.sessionId) ?? emptySession()
    const payload = interruptedPayload(interrupted)
    const existing = session.entries.get(interrupted.entryId)
    let nextSession: RuntimeSession
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
    return yield* updateSession(state, interrupted.sessionId, nextSession)
  })

const writerBelongsToRun = (
  session: RuntimeSession,
  run: { readonly runId: string; readonly ownerId?: string; readonly attemptFence: number },
) =>
  session.writer === undefined ||
  (session.writer.runId === run.runId &&
    session.writer.ownerId === run.ownerId &&
    session.writer.runAttemptFence === run.attemptFence)

export const appendTerminalToolResults = (input: {
  readonly state: RuntimeState
  readonly runId: string
  readonly terminal: RunTerminalOutcome
}): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation> =>
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
    const finish = (next: RuntimeState): RuntimeState => {
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
    if (Schema.is(SessionStoreError)(path)) {
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
    return yield* publishConversation({
      previous: input.state,
      sessionId: run.message.sessionId,
      next: finish({ ...state, sessions: new Map(state.sessions).set(run.message.sessionId, result[1]) }),
    }).pipe(Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })))
  })

const claimedUpdate = <Input extends readonly [ExecutionClaim, ...ReadonlyArray<unknown>], A, E>(
  modifyState: ModifyState,
  definition: Definition<Input, A>,
  input: Input,
  transition: (
    session: RuntimeSession,
    input: Input,
  ) => Effect.Effect<readonly [A, RuntimeSession], E, PreparedObservation>,
) =>
  modifyState(definition, input, (state, prepared) => {
    const claim = prepared[0]
    return requireExecutionClaim(state, claim).pipe(
      Effect.andThen(transition(state.sessions.get(claim.session.sessionId) ?? emptySession(), prepared)),
      Effect.flatMap(([value, session]) =>
        updateSession(state, claim.session.sessionId, session).pipe(Effect.map((next) => [value, next] as const)),
      ),
    )
  }).pipe(
    Effect.mapError((error) => {
      if (Schema.is(StaleClaim)(error) || Schema.is(StaleSessionClaim)(error))
        return SessionStoreError.make({ message: "Session write claim is stale", reason: "conflict", cause: error })
      if (Schema.is(DurabilityFailure)(error) || Schema.is(RuntimeUnavailable)(error))
        return sessionStorageFailure(error)
      return error
    }),
  )

export const claimedStore = (config: {
  readonly readState: Effect.Effect<RuntimeState, DurabilityFailure | RuntimeUnavailable>
  readonly modifyState: ModifyState
  readonly claim: ExecutionClaim
}): SessionStore => {
  const { readState, modifyState, claim } = config
  const sessionId = claim.session.sessionId
  const reads = reader({ readState, sessionId })
  return {
    reserveEntryId: (commandId) =>
      claimedUpdate(modifyState, commands.reserveEntryId, [claim, commandId], (session) =>
        Effect.succeed([String(session.counter), { ...session, counter: session.counter + 1 }] as const),
      ),
    append: (authoredInput, appendOptions) =>
      claimedUpdate(
        modifyState,
        commands.append,
        [claim, prepareSessionAppendInput(authoredInput), appendOptions],
        (session, [, input, options]) =>
          Effect.gen(function* () {
            yield* validatePayload({ value: input, boundary: "Session entry" }).pipe(
              Effect.mapError((error) => storeError(error.message)),
            )
            const result = append(session, input, options)
            return yield* isAppendSuccess(result) ? Effect.succeed(result) : Effect.fail(result)
          }),
      ).pipe(
        Effect.mapError((error) =>
          "id" in appendOptions &&
          Schema.is(SessionStoreError)(error) &&
          Schema.is(DurabilityFailure)(error.cause) &&
          error.cause.reason === "input-conflict"
            ? conflict("entry-id-reused", `Session entry id ${appendOptions.id} was reused with different content`)
            : error,
        ),
      ),
    appendCheckpoint: (request) =>
      claimedUpdate(modifyState, commands.appendCheckpoint, [claim, request], (session, [, prepared]) =>
        Effect.gen(function* () {
          yield* validatePayload({ value: prepared, boundary: "Session checkpoint" }).pipe(
            Effect.mapError((error) => storeError(error.message)),
          )
          if (prepared.compactionCommit !== undefined && prepared.compactionCommit.checkpointId !== prepared.id) {
            return yield* conflict("checkpoint-id-reused", "Compaction commit checkpoint identity diverges")
          }
          const existing = session.entries.get(prepared.id)
          if (existing !== undefined) {
            if (existing._tag !== "Compaction" || !checkpointMatches(existing, prepared)) {
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
              } satisfies CheckpointAppend,
              session,
            ] as const
          }
          if (prepared.parentId !== session.leaf) {
            return yield* conflict(
              "stale-leaf",
              `Expected Session leaf ${String(prepared.parentId)} but found ${String(session.leaf)}`,
            )
          }
          const checkpoint: CompactionEntry = {
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
            { _tag: "Appended" as const, checkpoint, leafId: checkpoint.id } satisfies CheckpointAppend,
            next,
          ] as const
        }),
      ).pipe(
        Effect.mapError((error) =>
          Schema.is(SessionStoreError)(error) &&
          Schema.is(DurabilityFailure)(error.cause) &&
          error.cause.reason === "input-conflict"
            ? conflict("checkpoint-id-reused", `Session checkpoint id ${request.id} was reused with different content`)
            : error,
        ),
      ),
    entry: reads.entry,
    pathPage: reads.pathPage,
    effectivePath: reads.effectivePath,
    latestCompaction: reads.latestCompaction,
    path: reads.path,
    setLeaf: (leaf, commandId) =>
      claimedUpdate(modifyState, commands.setLeaf, [claim, leaf, commandId], (session, [, id]) =>
        id !== null && !session.entries.has(id)
          ? Effect.fail(storeError(`Session entry ${id} does not exist`))
          : Effect.succeed([undefined, { ...session, leaf: id }] as const),
      ),
    leaf: reads.leaf,
  }
}
