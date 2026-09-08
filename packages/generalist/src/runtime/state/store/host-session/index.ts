import type { ModifyState } from "../../../../durability/internal/runtime.js"
import type { DurabilityFailure } from "../../../../durability/errors.js"
import { commands } from "../../../../durability/internal/runtime-command-admission.js"
import { occurredAt as preparedOccurredAt } from "../../observation.js"
import { Effect, Function, Queue, Schema, Stream, SynchronizedRef } from "effect"
import {
  type HostSession,
  HostSessionSnapshot,
  SessionSnapshotTooLarge,
  SessionConflict,
  SessionCursorExpired,
  SessionNotFound,
  SessionSubscriberLagged,
  type HostSessionEvent,
} from "../../../session/host.js"
import { RuntimeUnavailable } from "../../../errors.js"
import { validate as validatePayload } from "../../../execution/payload/index.js"
import type { Service as RunStoreService } from "../../../run/store.js"
import {
  emptySession,
  type HostSessionPublication,
  type HostSessionSubscriberQueue,
  type RuntimeState,
} from "../../projection.js"
import { toInspection } from "../events.js"
import { projectRunSnapshot } from "../../../execution/inspection.js"
import { projectConversation } from "./conversation.js"
import { submit, update } from "./queue.js"
import { SessionQueueConflict } from "../../../session/queue.js"

const hostSessionSnapshot = (state: RuntimeState, sessionId: string) =>
  Effect.gen(function* () {
    const session = yield* getHostSession(state, sessionId)
    const stored = state.hostSessions.get(sessionId)
    if (stored === undefined) return yield* missing(sessionId)
    const excess = (limit: SessionSnapshotTooLarge["limit"], maximum: number) =>
      SessionSnapshotTooLarge.make({ sessionId, limit, maximum })
    if (state.runs.size > 10000) return yield* excess("scanned-runs", 10000)
    const runs = []
    let events = 0
    let bytes = 0
    for (const run of state.runs.values()) {
      if (state.runs.get(run.rootRunId)?.message.sessionId !== sessionId) continue
      if (runs.length >= 128) return yield* excess("runs", 128)
      events += run.events.length
      if (events > 8192) return yield* excess("events", 8192)
      for (const event of run.events) {
        const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(event).pipe(
          Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
        )
        bytes += new TextEncoder().encode(encoded).byteLength
        if (bytes > 1048576) return yield* excess("bytes", 1048576)
      }
      const projection = {
        inspection: toInspection(state, run),
        rootRunId: run.rootRunId,
        events: run.events,
        firstTreePosition: 0,
      }
      if (run.parentRunId !== undefined) Object.assign(projection, { parentRunId: run.parentRunId })
      if (run.invocationId !== undefined) Object.assign(projection, { invocationId: run.invocationId })
      if (run.terminalEventId !== undefined) Object.assign(projection, { terminalEventId: run.terminalEventId })
      runs.push(yield* projectRunSnapshot(projection))
    }
    const conversation = yield* projectConversation({
      sessionId,
      session: state.sessions.get(sessionId) ?? emptySession(),
    })
    const snapshot: HostSessionSnapshot = { version: 1, session, cursor: stored.lastCursor, runs, conversation }
    const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(HostSessionSnapshot))(snapshot).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (new TextEncoder().encode(encoded).byteLength > 1048576) return yield* excess("bytes", 1048576)
    return snapshot
  })

const missing = (sessionId: string) =>
  SessionNotFound.make({
    sessionId,
    hint: "Create the Session through host.sessions.create before starting or observing Runs.",
  })

const createHostSession = (state: RuntimeState, input: import("../../../session/host.js").CreateSessionInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    yield* validatePayload({ value: input, boundary: "host Session metadata" })
    if (state.hostSessions.has(input.id)) {
      return yield* SessionConflict.make({
        sessionId: input.id,
        hint: "Use a different Session identity or load the existing Session.",
      })
    }
    const session: HostSession = {
      id: input.id,
      createdAt: yield* preparedOccurredAt,
      queue: [],
    }
    if (input.selection !== undefined) Object.assign(session, { selection: input.selection })
    if (input.title !== undefined) Object.assign(session, { title: input.title })
    const hostSessions = new Map(state.hostSessions)
    hostSessions.set(input.id, { session, lastCursor: -1, events: [], subscribers: new Map() })
    return [session, { ...state, hostSessions }] as const
  })

const getHostSession = (
  state: RuntimeState,
  sessionId: string,
): Effect.Effect<HostSession, SessionNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const stored = state.hostSessions.get(sessionId)
  return stored === undefined ? Effect.fail(missing(sessionId)) : Effect.succeed(stored.session)
}

const hostSessionRuns = (state: RuntimeState, sessionId: string) =>
  Effect.gen(function* () {
    yield* getHostSession(state, sessionId)
    return [...state.runs.values()]
      .filter((run) => run.rootRunId === run.runId && run.message.sessionId === sessionId)
      .map((run) => toInspection(state, run))
  })

const followHostSessionEvents: {
  (input: {
    readonly sessionId: string
    readonly cursor: number
  }): (
    stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>,
  ) => Stream.Stream<
    HostSessionEvent,
    SessionNotFound | SessionCursorExpired | SessionSubscriberLagged | RuntimeUnavailable
  >
  (
    stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>,
    input: { readonly sessionId: string; readonly cursor: number },
  ): Stream.Stream<
    HostSessionEvent,
    SessionNotFound | SessionCursorExpired | SessionSubscriberLagged | RuntimeUnavailable
  >
} = Function.dual(
  2,
  (
    stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>,
    input: { readonly sessionId: string; readonly cursor: number },
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const capacity = (yield* SynchronizedRef.get(stateRef)).subscriberQueueCapacity
        const liveQueue: HostSessionSubscriberQueue = yield* Queue.dropping<
          HostSessionEvent,
          SessionSubscriberLagged | RuntimeUnavailable
        >(capacity)
        const plan = yield* SynchronizedRef.modifyEffect(stateRef, (state) =>
          Effect.gen(function* () {
            if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
            const stored = state.hostSessions.get(input.sessionId)
            if (stored === undefined) return yield* missing(input.sessionId)
            if (input.cursor < -1 || input.cursor > stored.lastCursor) {
              return yield* SessionCursorExpired.make({
                sessionId: input.sessionId,
                cursor: input.cursor,
                earliestCursor: -1,
                latestCursor: stored.lastCursor,
                hint: "Restart replay from the earliest available Session cursor.",
              })
            }
            const subscriberId = state.nextSubscriberId
            const subscribers = new Map(stored.subscribers)
            subscribers.set(subscriberId, liveQueue)
            const hostSessions = new Map(state.hostSessions)
            hostSessions.set(input.sessionId, { ...stored, subscribers })
            return [
              {
                replay: stored.events.filter((entry) => entry.cursor > input.cursor),
                replayCutoff: stored.lastCursor,
                subscriberId,
              },
              { ...state, nextSubscriberId: subscriberId + 1, hostSessions },
            ] as const
          }),
        )
        yield* Effect.addFinalizer(() =>
          SynchronizedRef.update(stateRef, (state) => {
            const stored = state.hostSessions.get(input.sessionId)
            if (stored === undefined) return state
            const subscribers = new Map(stored.subscribers)
            subscribers.delete(plan.subscriberId)
            const hostSessions = new Map(state.hostSessions)
            hostSessions.set(input.sessionId, { ...stored, subscribers })
            return { ...state, hostSessions }
          }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
        )
        return Stream.concat(
          Stream.fromIterable(plan.replay),
          Stream.fromQueue(liveQueue).pipe(Stream.filter((entry) => entry.cursor > plan.replayCutoff)),
        )
      }),
    ),
)

/** Publish one committed Session event without blocking its producer. */
export const publish = (input: { readonly state: RuntimeState; readonly publication: HostSessionPublication }) =>
  Effect.gen(function* () {
    let state = input.state
    const host = input.publication
    for (const [subscriberId, queue] of host.subscribers) {
      const session = state.hostSessions.get(host.sessionId)
      if (session?.subscribers.get(subscriberId) !== queue) continue
      const offered = yield* Queue.offer(queue, host.entry)
      if (offered) continue
      yield* Queue.fail(
        queue,
        SessionSubscriberLagged.make({
          sessionId: host.sessionId,
          lastDeliveredCursor: host.lastDeliveredCursor,
          hint: "Resume the Session event stream from the last delivered cursor.",
        }),
      )
      const subscribers = new Map(session.subscribers)
      subscribers.delete(subscriberId)
      const hostSessions = new Map(state.hostSessions)
      hostSessions.set(host.sessionId, { ...session, subscribers })
      state = Object.assign({}, state, { hostSessions })
    }
    return state
  })

/** Construct the canonical operations owned by product-facing Sessions. */
export const make = (input: {
  readonly stateRef: SynchronizedRef.SynchronizedRef<RuntimeState>
  readonly readState: Effect.Effect<RuntimeState, RuntimeUnavailable | DurabilityFailure>
  readonly modifyState: ModifyState
}): Pick<
  RunStoreService,
  | "createHostSession"
  | "submitSessionInput"
  | "updateSessionInput"
  | "removeSessionInput"
  | "hostSession"
  | "hostSessionSnapshot"
  | "listHostSessions"
  | "hostSessionRuns"
  | "hostSessionEvents"
> => ({
  submitSessionInput: (request) =>
    input.modifyState(commands.submitSessionInput, [request], (state, [prepared]) =>
      submit({ state, input: prepared }),
    ),
  updateSessionInput: (request, resolveSelection) =>
    input.modifyState(commands.updateSessionInput, [request], (state, [prepared]) =>
      Effect.gen(function* () {
        if (prepared.agent === undefined) return yield* update({ state, input: prepared })
        if (prepared.selection !== undefined || resolveSelection === undefined) {
          return yield* SessionQueueConflict.make({
            sessionId: prepared.sessionId,
            reason: "selection",
            hint: "Provide one Agent name with its admission resolver, or an explicit pinned selection.",
          })
        }
        const selection = yield* resolveSelection(prepared.agent)
        return yield* update({ state, input: { ...prepared, selection } })
      }),
    ),
  removeSessionInput: (request) =>
    input.modifyState(commands.removeSessionInput, [request], (state, [prepared]) =>
      update({ state, input: prepared }),
    ),
  createHostSession: (request) =>
    input.modifyState(commands.createHostSession, [request], (state, [prepared]) => createHostSession(state, prepared)),
  hostSession: (sessionId) => input.readState.pipe(Effect.flatMap((state) => getHostSession(state, sessionId))),
  hostSessionSnapshot: (sessionId) =>
    input.readState.pipe(Effect.flatMap((state) => hostSessionSnapshot(state, sessionId))),
  listHostSessions: input.readState.pipe(
    Effect.flatMap((state) =>
      state.closed
        ? RuntimeUnavailable.make({ message: "runtime store released" })
        : Effect.succeed([...state.hostSessions.values()].map(({ session }) => session)),
    ),
  ),
  hostSessionRuns: (sessionId) => input.readState.pipe(Effect.flatMap((state) => hostSessionRuns(state, sessionId))),
  hostSessionEvents: (request) =>
    Stream.unwrap(input.readState.pipe(Effect.as(followHostSessionEvents(input.stateRef, request)))),
})
