import { Clock, DateTime, Effect, Schema } from "effect"
import { RuntimeUnavailable } from "../../errors.js"
import { RunStore, type Service as RunStoreService } from "../../run/store.js"
import { Runtime, type Service as RuntimeService } from "../../service.js"
import { nextAt, type ClaimedSchedule } from "./schedule.js"

const timeoutBatch = 64
const scheduleBatch = 16
const leaseMillis = 30_000
const encodeAdvanceIdentity = Schema.encodeSync(
  Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.String, Schema.Int])),
)

const fire = (store: RunStoreService, runtime: RuntimeService, ownerId: string, schedule: ClaimedSchedule) =>
  Effect.gen(function* () {
    // Resolve the following instant before admitting the Run: an unrepresentable
    // recurrence fails typed without leaving an admitted Run that can never advance.
    const following = yield* nextAt(schedule.rule, DateTime.toEpochMillis(DateTime.makeUnsafe(schedule.nextAt)))
    yield* runtime.startExecution({
      executable: schedule.definition.executable,
      registrations: schedule.definition.registrations,
      sessionId: schedule.definition.sessionId,
      idempotencyKey: `schedule:${schedule.scheduleId}:${schedule.occurrence}`,
      messageId: `schedule:${schedule.scheduleId}:${schedule.occurrence}`,
      prompt: schedule.definition.prompt,
      budget: schedule.definition.budget,
    })
    yield* store.advanceSchedule({
      commandId: `schedule-advance:${encodeAdvanceIdentity([ownerId, schedule.scheduleId, schedule.occurrence])}`,
      scheduleId: schedule.scheduleId,
      ownerId,
      occurrence: schedule.occurrence,
      nextAt: following,
    })
  })

/** Construct inert trigger control; only an activated host invokes its bounded drain. */
export const make = (ownerId: string) =>
  Effect.gen(function* () {
    const store = yield* RunStore
    const runtime = yield* Runtime
    let commandCounter = 0
    let schedulesFirst = false
    const drain = (fuel = timeoutBatch + scheduleBatch) => {
      const commandId = `${ownerId}:schedule-claim:${++commandCounter}`
      // Preparation belongs to this logical drain invocation, including Effect retries.
      schedulesFirst = !schedulesFirst
      const timeoutLimit = fuel === 1 ? Number(!schedulesFirst) : Math.min(timeoutBatch, Math.ceil(fuel / 2))
      const claimLimit = Math.min(scheduleBatch, fuel - timeoutLimit)
      return Effect.gen(function* () {
        if (!Number.isSafeInteger(fuel) || fuel <= 0) {
          return yield* RuntimeUnavailable.make({ message: "trigger fuel must be a positive safe integer" })
        }
        const now = yield* Clock.currentTimeMillis
        const due = timeoutLimit === 0 ? [] : yield* store.dueAwaitEvents({ now, limit: timeoutLimit })
        yield* Effect.forEach(
          due,
          (wait) =>
            store
              .timeoutAwaitEvent({
                ...wait,
                commandId: `await-timeout:${JSON.stringify([wait.runId, wait.waitId, wait.deadline])}`,
              })
              .pipe(
                Effect.catchTags({
                  "generalist/runtime/RunNotFound": () => Effect.succeed(false),
                  "generalist/runtime/RunTerminal": () => Effect.succeed(false),
                }),
              ),
          { discard: true },
        )
        const claimed =
          claimLimit === 0
            ? []
            : yield* store.claimSchedules({
                commandId,
                ownerId,
                leaseMillis,
                limit: claimLimit,
              })
        yield* Effect.forEach(claimed, (record) => fire(store, runtime, ownerId, record), {
          concurrency: 1,
          discard: true,
        })
        return {
          processed: due.length + claimed.length,
          hasMore:
            (timeoutLimit > 0 && due.length === timeoutLimit) || (claimLimit > 0 && claimed.length === claimLimit),
        }
      })
    }
    return { drain, tick: Effect.suspend(() => drain()).pipe(Effect.asVoid) }
  })
