import type { ModifyState } from "../../../../durability/internal/runtime.js"
import type { DurabilityFailure } from "../../../../durability/errors.js"
import { commands } from "../../../../durability/internal/runtime-command-admission.js"
import { occurredAt as preparedOccurredAt } from "../../observation.js"
import { Effect, Function, Queue, Stream, SynchronizedRef } from "effect"
import {
  type HostSession,
  type HostSessionSnapshot,
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
import { toInspection, retainedSession } from "../events.js"
import { projectConversation } from "./conversation.js"
import { submit, update, validateSelection, message } from "./queue.js"
import { page as familyPage } from "./family.js"
import { historyPage, runsPage, sessionRun, recentRuns } from "./page.js"
import { SessionQueueConflict } from "../../../session/queue.js"
import { control } from "./lifecycle.js"

const hostSessionSnapshot = (state: RuntimeState, sessionId: string) =>
  Effect.gen(function* () {
    const session = yield* getHostSession(state, sessionId)
    const stored = state.hostSessions.get(sessionId)
    if (stored === undefined) return yield* missing(sessionId)
    const runs = yield* recentRuns({ state, events: stored.events })
    if (session.activeRunId !== undefined && !runs.some((run) => run.runId === session.activeRunId))
      runs.push(yield* sessionRun({ state, sessionId, runId: session.activeRunId }))
    const conversation = yield* projectConversation({
      sessionId,
      session: state.sessions.get(sessionId) ?? emptySession(),
    })
    const snapshot: HostSessionSnapshot = {
      version: 1,
      session,
      cursor: stored.lastCursor,
      runs,
      conversation,
    }
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
    if (input.selection !== undefined)
      Object.assign(session, {
        selection: yield* validateSelection({ state, sessionId: input.id, selection: input.selection }).pipe(
          Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
        ),
      })
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
  return stored === undefined
    ? Effect.fail(missing(sessionId))
    : Effect.succeed({ ...stored.session, ...retainedSession({ state, sessionId }) })
}

const hostSessionRuns = (state: RuntimeState, sessionId: string) =>
  Effect.gen(function* () {
    yield* getHostSession(state, sessionId)
    return [...state.runs.values()]
      .filter((run) => run.message.sessionId === sessionId)
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
  | "controlSession"
  | "messageSessionInput"
  | "submitSessionInput"
  | "updateSessionInput"
  | "removeSessionInput"
  | "hostSession"
  | "hostSessionSnapshot"
  | "hostSessionFamily"
  | "hostSessionHistoryPage"
  | "hostSessionRunsPage"
  | "hostSessionRunSummary"
  | "listHostSessions"
  | "hostSessionRuns"
  | "hostSessionEvents"
> => ({
  messageSessionInput: (request) =>
    input.modifyState(commands.messageSessionInput, [request], (state, [prepared]) =>
      message({ state, input: prepared }),
    ),
  controlSession: (request) =>
    input.modifyState(commands.controlSession, [request], (state, [prepared]) => control(state, prepared)),
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
  hostSessionFamily: (sessionId, request) =>
    input.readState.pipe(Effect.flatMap((state) => familyPage({ state, sessionId, input: request }))),
  hostSessionHistoryPage: (sessionId, request) =>
    input.readState.pipe(Effect.flatMap((state) => historyPage({ state, sessionId, input: request }))),
  hostSessionRunsPage: (sessionId, request) =>
    input.readState.pipe(Effect.flatMap((state) => runsPage({ state, sessionId, input: request }))),
  hostSessionRunSummary: (sessionId, runId) =>
    input.readState.pipe(Effect.flatMap((state) => sessionRun({ state, sessionId, runId }))),
  listHostSessions: input.readState.pipe(
    Effect.flatMap((state) =>
      state.closed
        ? RuntimeUnavailable.make({ message: "runtime store released" })
        : Effect.succeed(
            [...state.hostSessions.values()].map(({ session }) => ({
              ...session,
              ...retainedSession({ state, sessionId: session.id }),
            })),
          ),
    ),
  ),
  hostSessionRuns: (sessionId) => input.readState.pipe(Effect.flatMap((state) => hostSessionRuns(state, sessionId))),
  hostSessionEvents: (request) =>
    Stream.unwrap(input.readState.pipe(Effect.as(followHostSessionEvents(input.stateRef, request)))),
})
