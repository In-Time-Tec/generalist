import { Effect, Queue, Stream, SynchronizedRef } from "effect"
import { CursorExpired, RunNotFound, RuntimeUnavailable, SubscriberLagged } from "../errors.js"
import type { Cursor } from "../cursor.js"
import type { RunInspection } from "../run.js"
import type { RunEvent } from "../run-event.js"
import type { MemoryState, SubscriberError, SubscriberQueue } from "./state.js"

export const toInspection = (
  run: MemoryState["runs"] extends ReadonlyMap<string, infer R> ? R : never,
): RunInspection => ({
  runId: run.runId,
  status: run.status,
  executableRef: run.executableRef,
  executableManifest: run.executableManifest,
  lastSequence: run.lastSequence,
  durability: "ephemeral",
  ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
  ...(run.wait === undefined ? {} : { wait: run.wait }),
})

export const inspectRun = (
  state: MemoryState,
  runId: string,
): Effect.Effect<RunInspection, RunNotFound | RuntimeUnavailable> => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const run = state.runs.get(runId)
  if (run === undefined) return Effect.fail(RunNotFound.make({ runId }))
  return Effect.succeed(toInspection(run))
}

export const followEvents = (
  stateRef: SynchronizedRef.SynchronizedRef<MemoryState>,
  input: { readonly runId: string; readonly cursor: Cursor },
): Stream.Stream<RunEvent, RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable> =>
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
  )

export const shutdownStore = (stateRef: SynchronizedRef.SynchronizedRef<MemoryState>): Effect.Effect<void> =>
  SynchronizedRef.modifyEffect(stateRef, (state) =>
    Effect.gen(function* () {
      if (state.closed) return [undefined, state] as const
      yield* Effect.forEach(
        state.runs.values(),
        (run) =>
          Effect.forEach(
            run.subscribers.values(),
            (queue) => Queue.fail(queue, RuntimeUnavailable.make({ message: "runtime store released" })),
            { discard: true },
          ),
        { discard: true },
      )
      return [undefined, { ...state, closed: true, runs: new Map() }] as const
    }),
  ).pipe(Effect.asVoid)
