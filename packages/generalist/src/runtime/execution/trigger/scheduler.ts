import { Clock, DateTime, Duration, Effect, Layer, Schedule } from "effect"
import { generateId } from "../../../core/model/telemetry/events.js"
import { RunStore, type Service as RunStoreService } from "../../run/store.js"
import { Runtime, type Service as RuntimeService } from "../../service.js"
import { nextAt, type ClaimedSchedule } from "./schedule.js"

const timeoutBatch = 64
const scheduleBatch = 16
const leaseMillis = 30_000

const resumeTimeouts = (store: RunStoreService, now: number) =>
  Effect.gen(function* () {
    const due = yield* store.dueAwaitEvents({ now, limit: timeoutBatch })
    yield* Effect.forEach(
      due,
      (wait) =>
        store.timeoutAwaitEvent({ ...wait, now }).pipe(
          Effect.catchTags({
            "generalist/runtime/RunNotFound": () => Effect.succeed(false),
            "generalist/runtime/RunTerminal": () => Effect.succeed(false),
          }),
        ),
      { discard: true },
    )
  })

const fire = (
  store: RunStoreService,
  runtime: RuntimeService,
  ownerId: string,
  now: number,
  schedule: ClaimedSchedule,
) =>
  runtime
    .startExecution({
      executable: schedule.definition.executable,
      registrations: schedule.definition.registrations,
      sessionId: schedule.definition.sessionId,
      idempotencyKey: `schedule:${schedule.scheduleId}:${schedule.occurrence}`,
      messageId: `schedule:${schedule.scheduleId}:${schedule.occurrence}`,
      prompt: schedule.definition.prompt,
      budget: schedule.definition.budget,
    })
    .pipe(
      Effect.andThen(
        store.advanceSchedule({
          scheduleId: schedule.scheduleId,
          ownerId,
          occurrence: schedule.occurrence,
          nextAt: nextAt(schedule.rule, DateTime.toEpochMillis(DateTime.makeUnsafe(schedule.nextAt))),
          now,
        }),
      ),
    )

const tick = (ownerId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const runtime = yield* Runtime
    const now = yield* Clock.currentTimeMillis
    yield* resumeTimeouts(store, now)
    const claimed = yield* store.claimSchedules({ ownerId, now, leaseMillis, limit: scheduleBatch })
    yield* Effect.forEach(claimed, (record) => fire(store, runtime, ownerId, now, record), {
      concurrency: 1,
      discard: true,
    })
  })

/** @internal Runtime-scoped environmental timeout and recurrence scheduler. */
export const layer = (options?: {
  readonly pollInterval?: Duration.Input
}): Layer.Layer<never, never, RunStore | Runtime> =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const ownerId = `trigger:${yield* generateId}`
      const pollInterval = options?.pollInterval ?? "250 millis"
      const guardedTick = tick(ownerId).pipe(
        Effect.catchCause((cause) => Effect.logError("runtime-trigger-scheduler.tick-failed", cause)),
      )
      yield* Effect.forkScoped(
        Effect.sleep(pollInterval).pipe(Effect.andThen(guardedTick), Effect.repeat(Schedule.spaced(pollInterval))),
      )
    }),
  )
