import { type Cause, Effect, Queue, Ref, type Semaphore } from "effect"
import type { Response } from "effect/unstable/ai"
import { ProgressOverflow, type ToolProgress } from "../event.js"
import type { ProgressOverflowPolicy } from "../service.js"
import type { Progress } from "../../tools/tool-context.js"

export type ProgressQueue = Queue.Queue<ToolProgress, Cause.Done | ProgressOverflow>

/** @internal Tool-progress queue and emitter for one overflow policy. */
export const make = (progressPolicy: ProgressOverflowPolicy) => {
  const makeProgressQueue = (): Effect.Effect<ProgressQueue> => {
    switch (progressPolicy._tag) {
      case "Backpressure":
        return Queue.bounded(progressPolicy.capacity)
      case "Dropping":
      case "Fail":
        return Queue.dropping(progressPolicy.capacity)
      case "Sliding":
        return Queue.sliding(progressPolicy.capacity)
    }
  }
  const progressEvent = (turn: number, progress: Progress): ToolProgress => {
    const base = { _tag: "ToolProgress" as const, turn, toolCallId: progress.toolCallId }
    const { message, data } = progress
    if (message === undefined) return data === undefined ? base : { ...base, data }
    if (data === undefined) return { ...base, message }
    return { ...base, message, data }
  }
  const emitProgress =
    (
      turn: number,
      call: Response.ToolCallPart<string, unknown>,
      progressQueue: ProgressQueue,
      droppedProgress: Ref.Ref<number>,
      emitSemaphore: Semaphore.Semaphore,
    ) =>
    (progress: Progress): Effect.Effect<boolean> => {
      const event = progressEvent(turn, progress)
      return emitSemaphore.withPermit(
        Effect.gen(function* () {
          if (progressPolicy._tag === "Sliding") {
            const accepted = yield* Effect.sync(() => {
              const full = Queue.isFullUnsafe(progressQueue)
              const offered = Queue.offerUnsafe(progressQueue, event)
              return { dropped: full && offered, offered }
            })
            if (accepted.dropped) yield* Ref.update(droppedProgress, (count) => count + 1)
            return accepted.offered
          }
          const offered = yield* Queue.offer(progressQueue, event)
          if (progressPolicy._tag === "Dropping" && !offered) {
            yield* Ref.update(droppedProgress, (count) => count + 1)
          } else if (progressPolicy._tag === "Fail" && !offered) {
            yield* Queue.fail(
              progressQueue,
              ProgressOverflow.make({ turn, toolCallId: call.id, capacity: progressPolicy.capacity }),
            )
          }
          return offered
        }),
      )
    }
  return { makeProgressQueue, emitProgress }
}
