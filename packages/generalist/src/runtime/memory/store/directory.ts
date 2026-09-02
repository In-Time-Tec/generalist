import { Clock, Effect, Function, Schema } from "effect"
import type { Address } from "../../address.js"
import {
  AgentName as AgentNameSchema,
  nameScope,
  parseAddress,
  runAddress,
  type AgentName,
  type DirectoryEntry,
} from "../../execution/agent/directory.js"
import { AddressNotFound, AgentNameConflict, RunNotFound, RuntimeUnavailable } from "../../errors.js"
import { agentNameKey, type MemoryState, type StoredRun } from "../state.js"
import {
  fromMailboxEntry,
  notificationIdFor,
  observationEntry,
  payloadFromEvent,
  type Notification,
} from "../../child/settlement.js"
import type { RunEvent } from "../../run/event.js"

const requireRun = (state: MemoryState, runId: string): Effect.Effect<StoredRun, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  return run === undefined ? Effect.fail(RunNotFound.make({ runId })) : Effect.succeed(run)
}

const toEntry = (state: MemoryState, run: StoredRun): DirectoryEntry => {
  const scope = nameScope({
    runId: run.runId,
    parentRunId: run.parentRunId,
  })
  const name = [...state.agentNames.entries()].find(
    ([key, runId]) => runId === run.runId && key.startsWith(`${scope}\0`),
  )?.[0]
  const entry = {
    address: runAddress(run.runId),
    runId: run.runId,
    rootRunId: run.rootRunId,
    sessionId: run.message.sessionId,
    status: run.status,
  }
  const decodedName = name === undefined ? undefined : Schema.decodeSync(AgentNameSchema)(name.slice(scope.length + 1))
  if (run.parentRunId !== undefined && decodedName !== undefined) {
    return { ...entry, parentRunId: run.parentRunId, name: decodedName }
  }
  if (run.parentRunId !== undefined) return { ...entry, parentRunId: run.parentRunId }
  if (decodedName !== undefined) return { ...entry, name: decodedName }
  return entry
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
      parentRunId: run.parentRunId,
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
        .toSorted((left, right) => left.sequence - right.sequence)
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
      const joined = [...state.fanOuts.values()].some(
        (fanOut) =>
          fanOut.parentRunId === input.parent.runId &&
          fanOut.members.some((member) => member.childRunId === input.child.runId),
      )
      let payloadInput: Parameters<typeof payloadFromEvent>[0] = {
        parentRunId: input.parent.runId,
        childRunId: input.child.runId,
        event: input.event,
      }
      if (joined) payloadInput = { ...payloadInput, joined: true }
      const payload = payloadFromEvent(payloadInput)
      if (payload === undefined) return state
      const forSession = [...state.messages.values()].filter(
        (entry) => entry.targetSessionId === input.parent.message.sessionId,
      )
      const entry = observationEntry({
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
