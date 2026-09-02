import { Effect, Function, Queue, Stream, SynchronizedRef } from "effect"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../../errors.js"
import type { Cursor } from "../../cursor.js"
import type { RunInspection } from "../../run.js"
import type { RunEvent } from "../../run/event.js"
import {
  openRunWaits,
  type MemoryState,
  type SubscriberError,
  type SubscriberQueue,
  type TreeSubscriberQueue,
} from "../state.js"

type StoredRun = MemoryState["runs"] extends ReadonlyMap<string, infer R> ? R : never

export const toInspection: {
  (run: StoredRun): (state: MemoryState) => RunInspection
  (state: MemoryState, run: StoredRun): RunInspection
} = Function.dual(2, (state: MemoryState, run: StoredRun): RunInspection => {
  const optionals = () => {
    const parent = run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }
    const readiness = run.childReadiness === undefined ? parent : { ...parent, childReadiness: run.childReadiness }
    return readiness
  }
  return {
    runId: run.runId,
    status: run.status,
    executableRef: run.executableRef,
    executableManifest: run.executableManifest,
    depth: run.depth,
    treePolicy: run.treePolicy,
    waits: openRunWaits(state, run.runId),
    lastSequence: run.lastSequence,
    durability: "ephemeral",
    branches: [...state.runs.values()]
      .filter((candidate) => candidate.forkedFrom === run.runId && candidate.forkSequence !== undefined)
      .flatMap((candidate) =>
        candidate.forkSequence === undefined ? [] : [{ runId: candidate.runId, forkedAt: candidate.forkSequence }],
      ),
    ...optionals(),
  }
})

export const inspectRun: {
  (runId: string): (state: MemoryState) => Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
  (state: MemoryState, runId: string): Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable>
} = Function.dual(
  2,
  (state: MemoryState, runId: string): Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable> => {
    if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
    const run = state.runs.get(runId)
    if (run === undefined) return Effect.fail(RunNotFound.make({ runId }))
    return Effect.succeed(toInspection(state, run))
  },
)

export const followEvents: {
  (input: {
    readonly runId: string
    readonly cursor: Cursor
  }): (
    stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
  ) => Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
  (
    stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
    input: { readonly runId: string; readonly cursor: Cursor },
  ): Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable>
} = Function.dual(
  2,
  (
    stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
    input: { readonly runId: string; readonly cursor: Cursor },
  ) =>
    Stream.unwrap(
      Effect.gen(function* () {
        const capacity = (yield* SynchronizedRef.get(stateRef)).subscriberQueueCapacity
        const liveQueue: SubscriberQueue = yield* Queue.dropping<RunEvent, SubscriberError>(capacity)

        const plan = yield* SynchronizedRef.modifyEffect(stateRef, (state) =>
          Effect.gen(function* () {
            if (state.closed) {
              return yield* RuntimeUnavailable.make({ message: "runtime store released" })
            }
            const run = state.runs.get(input.runId)
            if (run === undefined) return yield* RunNotFound.make({ runId: input.runId })
            if (input.cursor < -1 || input.cursor > run.lastSequence) {
              return yield* CursorExpired.make({
                runId: input.runId,
                cursor: input.cursor,
                earliestSequence: run.events[0]?.sequence ?? 0,
              })
            }
            const replay = run.events.filter((event) => event.sequence > input.cursor)
            const subscriberId = state.nextSubscriberId
            const subscribers = new Map(run.subscribers)
            subscribers.set(subscriberId, liveQueue)
            const runs = new Map(state.runs)
            runs.set(input.runId, { ...run, subscribers })
            return [
              { replay, subscriberId },
              { ...state, runs, nextSubscriberId: subscriberId + 1 },
            ] as const
          }),
        )

        yield* Effect.addFinalizer(() =>
          SynchronizedRef.update(stateRef, (state) => {
            const run = state.runs.get(input.runId)
            if (run === undefined) return state
            const subscribers = new Map(run.subscribers)
            subscribers.delete(plan.subscriberId)
            const runs = new Map(state.runs)
            runs.set(input.runId, { ...run, subscribers })
            return { ...state, runs }
          }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
        )

        return Stream.concat(Stream.fromIterable(plan.replay), Stream.fromQueue(liveQueue))
      }),
    ),
)

export const followTreeChanges: {
  (
    rootRunId: string,
  ): (stateRef: SynchronizedRef.SynchronizedRef<MemoryState>) => Stream.Stream<void, RunNotFound | RuntimeUnavailable>
  (
    stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
    rootRunId: string,
  ): Stream.Stream<void, RunNotFound | RuntimeUnavailable>
} = Function.dual(2, (stateRef: SynchronizedRef.SynchronizedRef<MemoryState>, rootRunId: string) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const liveQueue: TreeSubscriberQueue = yield* Queue.sliding<void, RuntimeUnavailable>(1)
      const subscriberId = yield* SynchronizedRef.modifyEffect(stateRef, (state) =>
        Effect.gen(function* () {
          if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
          const root = state.treeRoots.get(rootRunId)
          if (root === undefined) return yield* RunNotFound.make({ runId: rootRunId })
          const id = state.nextSubscriberId
          const subscribers = new Map(root.subscribers)
          subscribers.set(id, liveQueue)
          const treeRoots = new Map(state.treeRoots)
          treeRoots.set(rootRunId, { ...root, subscribers })
          return [id, { ...state, nextSubscriberId: id + 1, treeRoots }] as const
        }),
      )
      yield* Effect.addFinalizer(() =>
        SynchronizedRef.update(stateRef, (state) => {
          const root = state.treeRoots.get(rootRunId)
          if (root === undefined) return state
          const subscribers = new Map(root.subscribers)
          subscribers.delete(subscriberId)
          const treeRoots = new Map(state.treeRoots)
          treeRoots.set(rootRunId, { ...root, subscribers })
          return { ...state, treeRoots }
        }).pipe(Effect.andThen(Queue.shutdown(liveQueue)), Effect.asVoid),
      )
      return Stream.concat(Stream.succeed(undefined), Stream.fromQueue(liveQueue))
    }),
  ),
)

export const shutdownStore = (stateRef: SynchronizedRef.SynchronizedRef<MemoryState>): Effect.Effect<void> =>
  SynchronizedRef.modifyEffect(stateRef, (state) =>
    Effect.gen(function* () {
      if (state.closed) return [undefined, state] as const
      const unavailable = RuntimeUnavailable.make({ message: "runtime store released" })
      yield* Effect.all(
        [
          Effect.forEach(
            state.runs.values(),
            (run) =>
              Effect.forEach(run.subscribers.values(), (queue) => Queue.fail(queue, unavailable), { discard: true }),
            { discard: true },
          ),
          Effect.forEach(
            state.treeRoots.values(),
            (root) =>
              Effect.forEach(root.subscribers.values(), (queue) => Queue.fail(queue, unavailable), { discard: true }),
            { discard: true },
          ),
          Effect.forEach(
            state.hostSessions.values(),
            (session) =>
              Effect.forEach(session.subscribers.values(), (queue) => Queue.fail(queue, unavailable), {
                discard: true,
              }),
            { discard: true },
          ),
        ],
        { discard: true },
      )
      return [
        undefined,
        { ...state, closed: true, runs: new Map(), treeRoots: new Map(), hostSessions: new Map() },
      ] as const
    }),
  ).pipe(Effect.asVoid)
