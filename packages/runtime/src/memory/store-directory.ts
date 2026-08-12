import { Clock, Effect, Function } from "effect"
import type { Address } from "../address.js"
import {
  nameScope,
  parseAddress,
  runAddress,
  sessionAddress,
  type AgentName,
  type DirectoryEntry,
} from "../agent-directory.js"
import {
  AddressNotFound,
  AgentNameConflict,
  MailboxFull,
  MailboxRateLimited,
  MessageConflict,
  RunNotFound,
  RuntimeUnavailable,
} from "../errors.js"
import { steeringKey, type MailboxEntry } from "../mailbox.js"
import type { AdmitMessageInput } from "../run-store.js"
import { deliveryPrompt } from "../mailbox.js"
import { digest as steeringDigest } from "../steering.js"
import { isTerminal } from "../run.js"
import { agentNameKey, type MemoryState, type StoredRun } from "./state.js"
import {
  fromMailboxEntry,
  mailboxEntry,
  notificationIdFor,
  payloadFromEvent,
  type Notification,
} from "../child-settlement.js"
import type { RunEvent } from "../run-event.js"
import { appendLifecycle } from "./append.js"

const requireRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const toEntry = (state: MemoryState, run: StoredRun): DirectoryEntry => {
  const scope = nameScope({
    runId: run.runId,
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
  })
  const name = [...state.agentNames.entries()].find(
    ([key, runId]) => runId === run.runId && key.startsWith(`${scope}\0`),
  )
  return {
    address: runAddress(run.runId),
    runId: run.runId,
    rootRunId: run.rootRunId,
    sessionId: run.message.sessionId,
    status: run.status,
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    ...(name === undefined ? {} : { name: name[0].slice(scope.length + 1) as AgentName }),
  }
}

export const directory: {
  (runId: string): (state: MemoryState) => Effect.Effect<DirectoryEntry, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<DirectoryEntry, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.map(requireRun(state, runId), (run) => toEntry(state, run)),
)

/**
 * Resolve an Address to the Run that currently answers for it.
 *
 * A session address names an agent identity across successive Runs, so it resolves to that
 * session's newest Run. A run address names one exact execution. A name address resolves through
 * the naming scope that owns it. None of these read authority out of the Address text.
 */
export const resolveAddress: {
  (address: Address): (state: MemoryState) => Effect.Effect<DirectoryEntry, AddressNotFound | RuntimeUnavailable>
  (state: MemoryState, address: Address): Effect.Effect<DirectoryEntry, AddressNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, address: Address) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const target = yield* parseAddress(address).pipe(Effect.catch(() => AddressNotFound.make({ address })))
    if (target._tag === "Run") {
      const run = state.runs.get(target.runId)
      if (run === undefined) return yield* AddressNotFound.make({ address })
      return toEntry(state, run)
    }
    if (target._tag === "Name") {
      const runId = state.agentNames.get(agentNameKey(target.scope, target.name))
      const run = runId === undefined ? undefined : state.runs.get(runId)
      if (run === undefined) return yield* AddressNotFound.make({ address })
      return toEntry(state, run)
    }
    const runs = [...state.runs.values()].filter((run) => run.message.sessionId === target.sessionId)
    const newest = runs.at(-1)
    if (newest === undefined) return yield* AddressNotFound.make({ address })
    return toEntry(state, newest)
  }),
)

export const registerAgentName: {
  (input: {
    readonly runId: string
    readonly name: AgentName
  }): (
    state: MemoryState,
  ) => Effect.Effect<readonly [DirectoryEntry, MemoryState], RunNotFound | AgentNameConflict | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly runId: string; readonly name: AgentName },
  ): Effect.Effect<readonly [DirectoryEntry, MemoryState], RunNotFound | AgentNameConflict | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string; readonly name: AgentName }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    const scope = nameScope({
      runId: run.runId,
      ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    })
    const key = agentNameKey(scope, input.name)
    const existing = state.agentNames.get(key)
    if (existing !== undefined && existing !== input.runId) {
      return yield* AgentNameConflict.make({ scope, name: input.name, existingRunId: existing })
    }
    const agentNames = new Map(state.agentNames)
    agentNames.set(key, input.runId)
    const next = { ...state, agentNames }
    return [toEntry(next, run), next] as const
  }),
)

export const listRelated: {
  (
    runId: string,
  ): (state: MemoryState) => Effect.Effect<ReadonlyArray<DirectoryEntry>, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<ReadonlyArray<DirectoryEntry>, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, runId: string) =>
  Effect.map(requireRun(state, runId), (run) =>
    [...state.runs.values()]
      .filter(
        (candidate) =>
          candidate.runId !== run.runId &&
          (candidate.runId === run.parentRunId ||
            candidate.parentRunId === run.runId ||
            (run.parentRunId !== undefined && candidate.parentRunId === run.parentRunId)),
      )
      .map((candidate) => toEntry(state, candidate)),
  ),
)

const messageKey = (input: { readonly sessionId: string; readonly messageId: string; readonly key: string }): string =>
  `${input.sessionId}\0${input.messageId}\0${input.key}`

/**
 * One message still owed to this session.
 *
 * Pending-ness is derived from consumption, not from binding. A message bound to a Run that reached
 * a terminal state without consuming it was never seen by any model, so it returns to pending and
 * the session's next Run takes it. Binding alone must not strand a message on a dead Run.
 */
const settlementEntry = (entry: MailboxEntry): boolean => entry.entryId.startsWith("child-settled:")

const deliverable = (state: MemoryState, entry: MailboxEntry): boolean => {
  if (entry.to === sessionAddress(entry.targetSessionId)) return true
  const target = [...state.runs.values()].find((run) => runAddress(run.runId) === entry.to)
  return target !== undefined && !isTerminal(target.status)
}

/** One child-settled notification still reaches its addressed Run while that Run is alive. */
const settlementDeliverable = (state: MemoryState, entry: MailboxEntry): boolean => {
  if (entry.to === sessionAddress(entry.targetSessionId)) return false
  const addressed = [...state.runs.values()].find((run) => runAddress(run.runId) === entry.to)
  return addressed !== undefined && !isTerminal(addressed.status)
}

const owed = (state: MemoryState, entry: MailboxEntry): boolean => {
  if (entry.deliveredRunId === undefined) return true
  const holder = state.runs.get(entry.deliveredRunId)
  if (holder === undefined || !isTerminal(holder.status)) return false
  return !holder.steering.some(
    (steering) => steering.entryId === entry.steeringEntryId && steering.consumedOperationId !== undefined,
  )
}

export const pendingMessages: {
  (input: {
    readonly sessionId: string
    readonly runId?: string
    readonly limit: number
  }): (state: MemoryState) => ReadonlyArray<MailboxEntry>
  (
    state: MemoryState,
    input: { readonly sessionId: string; readonly runId?: string; readonly limit: number },
  ): ReadonlyArray<MailboxEntry>
} = Function.dual(
  2,
  (
    state: MemoryState,
    input: { readonly sessionId: string; readonly runId?: string; readonly limit: number },
  ): ReadonlyArray<MailboxEntry> =>
    [...state.messages.values()]
      .filter(
        (entry) =>
          entry.targetSessionId === input.sessionId &&
          !settlementEntry(entry) &&
          (input.runId === undefined ||
            entry.to === sessionAddress(input.sessionId) ||
            (entry.to === runAddress(input.runId) &&
              !isTerminal(state.runs.get(input.runId)?.status ?? "cancelled"))) &&
          owed(state, entry),
      )
      .sort((left, right) => left.sequence - right.sequence)
      .slice(0, input.limit),
)

export const settlementNotifications: {
  (input: {
    readonly parentRunId: string
    readonly afterSequence: number
    readonly limit: number
  }): (state: MemoryState) => Effect.Effect<ReadonlyArray<Notification>, RunNotFound | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly parentRunId: string; readonly afterSequence: number; readonly limit: number },
  ): Effect.Effect<ReadonlyArray<Notification>, RunNotFound | RuntimeUnavailable>
} = Function.dual(
  2,
  (
    state: MemoryState,
    input: { readonly parentRunId: string; readonly afterSequence: number; readonly limit: number },
  ) =>
    Effect.gen(function* () {
      const parent = yield* requireRun(state, input.parentRunId)
      return [...state.messages.values()]
        .filter(
          (entry) =>
            entry.targetSessionId === parent.message.sessionId &&
            entry.to === runAddress(input.parentRunId) &&
            entry.entryId.startsWith("child-settled:") &&
            entry.sequence > input.afterSequence,
        )
        .sort((left, right) => left.sequence - right.sequence)
        .flatMap((entry) => {
          const notification = fromMailboxEntry(entry)
          return notification?.parentRunId === input.parentRunId ? [notification] : []
        })
        .slice(0, input.limit)
    }),
)

export const admitChildSettlement: {
  (input: {
    readonly parent: StoredRun
    readonly child: StoredRun
    readonly event: RunEvent
  }): (state: MemoryState) => Effect.Effect<MemoryState>
  (
    state: MemoryState,
    input: { readonly parent: StoredRun; readonly child: StoredRun; readonly event: RunEvent },
  ): Effect.Effect<MemoryState>
} = Function.dual(
  2,
  (state: MemoryState, input: { readonly parent: StoredRun; readonly child: StoredRun; readonly event: RunEvent }) =>
    Effect.gen(function* () {
      const notificationId = notificationIdFor(input.child.runId)
      const key = messageKey({
        sessionId: input.parent.message.sessionId,
        messageId: notificationId,
        key: notificationId,
      })
      if (state.messages.has(key)) return state
      const payload = payloadFromEvent({
        parentRunId: input.parent.runId,
        childRunId: input.child.runId,
        event: input.event,
      })
      if (payload === undefined) return state
      const forSession = [...state.messages.values()].filter(
        (entry) => entry.targetSessionId === input.parent.message.sessionId,
      )
      const entry = mailboxEntry({
        payload,
        parentSessionId: input.parent.message.sessionId,
        sequence: forSession.reduce((highest, item) => Math.max(highest, item.sequence + 1), 0),
        admittedAtMillis: yield* Clock.currentTimeMillis,
      })
      const messages = new Map(state.messages)
      messages.set(key, entry)
      return { ...state, messages }
    }),
)

export const admitMessage: {
  (
    input: AdmitMessageInput,
  ): (
    state: MemoryState,
  ) => Effect.Effect<
    readonly [import("../mailbox.js").MessageReceipt, MemoryState],
    MailboxFull | MailboxRateLimited | MessageConflict | RunNotFound | RuntimeUnavailable
  >
  (
    state: MemoryState,
    input: AdmitMessageInput,
  ): Effect.Effect<
    readonly [import("../mailbox.js").MessageReceipt, MemoryState],
    MailboxFull | MailboxRateLimited | MessageConflict | RunNotFound | RuntimeUnavailable
  >
} = Function.dual(2, (state: MemoryState, input: AdmitMessageInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const key = messageKey({
      sessionId: input.targetSessionId,
      messageId: input.messageId,
      key: input.idempotencyKey,
    })
    const prior = state.messages.get(key)
    if (prior !== undefined) {
      if (prior.digest !== input.digest) {
        return yield* MessageConflict.make({
          to: input.to,
          messageId: input.messageId,
          idempotencyKey: input.idempotencyKey,
        })
      }
      return [
        { messageId: prior.messageId, entryId: prior.entryId, sequence: prior.sequence, duplicate: true },
        state,
      ] as const
    }
    const now = yield* Clock.currentTimeMillis
    const forSession = [...state.messages.values()].filter((entry) => entry.targetSessionId === input.targetSessionId)
    const quotaEntries = forSession.filter((entry) => !settlementEntry(entry) && deliverable(state, entry))
    const pending = quotaEntries.filter((entry) => owed(state, entry))
    if (pending.length >= input.bounds.maxPending) {
      return yield* MailboxFull.make({ to: input.to, dimension: "pending", limit: input.bounds.maxPending })
    }
    const pendingBytes = pending.reduce((total, entry) => total + entry.bytes, 0)
    if (pendingBytes + input.bytes > input.bounds.maxPendingBytes) {
      return yield* MailboxFull.make({ to: input.to, dimension: "bytes", limit: input.bounds.maxPendingBytes })
    }
    const windowStart = now - input.bounds.windowMillis
    const recent = quotaEntries.filter((entry) => entry.admittedAtMillis > windowStart)
    if (recent.length >= input.bounds.maxPerWindow) {
      return yield* MailboxRateLimited.make({
        to: input.to,
        limit: input.bounds.maxPerWindow,
        windowMillis: input.bounds.windowMillis,
      })
    }
    const sequence = forSession.reduce((highest, entry) => Math.max(highest, entry.sequence + 1), 0)
    const entry: MailboxEntry = {
      entryId: `msg_${state.nextMessageCounter}`,
      targetSessionId: input.targetSessionId,
      sequence,
      from: input.fromAddress,
      fromRunId: input.fromRunId,
      to: input.to,
      messageId: input.messageId,
      idempotencyKey: input.idempotencyKey,
      digest: input.digest,
      bytes: input.bytes,
      admittedAtMillis: now,
      prompt: input.prompt,
      correlationId: input.correlationId,
      metadata: input.metadata,
      ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
      ...(input.inReplyTo === undefined ? {} : { inReplyTo: input.inReplyTo }),
    }
    const messages = new Map(state.messages)
    messages.set(key, entry)
    return [
      { messageId: entry.messageId, entryId: entry.entryId, sequence, duplicate: false },
      { ...state, nextMessageCounter: state.nextMessageCounter + 1, messages },
    ] as const
  }),
)

/**
 * Bind every pending message for a Run's session to that Run's steering inbox.
 *
 * Steering is already consumed atomically with the next model operation checkpoint, and the agent
 * loop drains it only at a turn boundary. Binding delivery to that one mechanism is what makes
 * delivery exactly-once from the consumer's view and keeps it out of an active model turn.
 */
export const deliverPendingMessages: {
  (input: {
    readonly runId: string
  }): (
    state: MemoryState,
  ) => Effect.Effect<readonly [ReadonlyArray<MailboxEntry>, MemoryState], RunNotFound | RuntimeUnavailable>
  (
    state: MemoryState,
    input: { readonly runId: string },
  ): Effect.Effect<readonly [ReadonlyArray<MailboxEntry>, MemoryState], RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: { readonly runId: string }) =>
  Effect.gen(function* () {
    const run = yield* requireRun(state, input.runId)
    if (isTerminal(run.status) || run.pendingOutcome !== undefined) return [[], state] as const
    const pending = pendingMessages(state, {
      sessionId: run.message.sessionId,
      runId: run.runId,
      limit: Number.MAX_SAFE_INTEGER,
    })
    // Child settlements are deliberately excluded from pendingMessages (the messages channel), but
    // a notification whose addressed parent Run is terminal was never seen by any model, so it is
    // still owed to the session and the session's next Run takes it, exactly like any other
    // message that outlives its bound Run. Deliver owed settlements into the same steering inbox so
    // the settlement reaches the model exactly once.
    const settlements = [...state.messages.values()].filter(
      (entry) =>
        entry.targetSessionId === run.message.sessionId &&
        entry.entryId.startsWith("child-settled:") &&
        owed(state, entry) &&
        !settlementDeliverable(state, entry),
    )
    if (pending.length === 0 && settlements.length === 0) return [[], state] as const
    const messages = new Map(state.messages)
    const steering = [...run.steering]
    const delivered: Array<MailboxEntry> = []
    let counter = state.nextSteeringCounter
    for (const entry of [...pending, ...settlements]) {
      const idempotencyKey = steeringKey(entry.entryId)
      const prompt = deliveryPrompt(entry)
      const steeringEntryId = `steer_${counter}`
      counter = counter + 1
      steering.push({
        entryId: steeringEntryId,
        runId: run.runId,
        sequence: steering.length,
        idempotencyKey,
        digest: steeringDigest(prompt),
        prompt,
      })
      const bound: MailboxEntry = { ...entry, deliveredRunId: run.runId, steeringEntryId }
      delivered.push(bound)
      messages.set(
        messageKey({
          sessionId: entry.targetSessionId,
          messageId: entry.messageId,
          key: entry.idempotencyKey,
        }),
        bound,
      )
    }
    if (delivered.length === 0) return [[], state] as const
    const runs = new Map(state.runs)
    runs.set(run.runId, { ...run, steering })
    let next: MemoryState = { ...state, nextSteeringCounter: counter, messages, runs }
    for (const entry of steering.slice(run.steering.length)) {
      const [, accepted] = yield* appendLifecycle(next, run.runId, {
        _tag: "SteeringAccepted",
        entryId: entry.entryId,
        steeringSequence: entry.sequence,
        idempotencyKey: entry.idempotencyKey,
        digest: entry.digest,
        prompt: entry.prompt,
      })
      next = accepted
    }
    return [delivered, next] as const
  }),
)
