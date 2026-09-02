import { DateTime, Effect, Function, Option, Schema, type Types } from "effect"
import {
  BudgetLimits,
  Exhausted,
  type Dimension,
  type Remaining,
  type RunBudget,
} from "../../core/durable/run-budget.js"
import { LoopDriverState } from "../../core/durable/loop-driver-state.js"
import type { DriverCheckpoint } from "../../core/durable/driver.js"
import type { RunEvent } from "../run/event.js"
import type { Service as RunStore } from "../run/store.js"

const Integer = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

/** Deterministically split one available reservation across fan-out members. */
export const split =
  (count: number) =>
  (limits: BudgetLimits): BudgetLimits => {
    const divisor = Schema.decodeSync(Integer)(count)
    if (divisor === 0) return {}
    const result: Types.Mutable<BudgetLimits> = {}
    if (limits.tokens !== undefined) result.tokens = Math.floor(limits.tokens / divisor)
    if (limits.usd !== undefined) result.usd = limits.usd / divisor
    if (limits.duration !== undefined) result.duration = limits.duration / divisor
    if (limits.toolCalls !== undefined) result.toolCalls = Math.floor(limits.toolCalls / divisor)
    if (limits.children !== undefined) result.children = Math.floor(limits.children / divisor)
    return Schema.decodeSync(BudgetLimits)(result)
  }

/** Apply an optional per-member fan-out limit without widening its reserved share. */
export const narrowGrant: {
  (requested: BudgetLimits | undefined): (grant: BudgetLimits) => BudgetLimits | undefined
  (grant: BudgetLimits, requested: BudgetLimits | undefined): BudgetLimits | undefined
} = Function.dual(2, (grant: BudgetLimits, requested: BudgetLimits | undefined): BudgetLimits | undefined => {
  if (requested === undefined) return grant
  for (const dimension of ["tokens", "usd", "duration", "toolCalls", "children"] as const) {
    const limit = grant[dimension]
    const value = requested[dimension]
    if (limit !== undefined && value !== undefined && value > limit) return undefined
  }
  return Schema.decodeSync(BudgetLimits)({ ...grant, ...requested })
})

export const firstExhausted = (remaining: Remaining): Dimension | undefined => {
  for (const dimension of ["tokens", "usd", "duration"] as const) {
    if (remaining[dimension] === 0) return dimension
  }
  return undefined
}

export const requireAvailable = (remaining: Remaining): Effect.Effect<void, Exhausted> => {
  const budget = firstExhausted(remaining)
  return budget === undefined ? Effect.void : Effect.fail(Exhausted.make({ budget, requested: 1, remaining: 0 }))
}

export const requireRunAvailable = (runId: string) => (store: RunStore) =>
  store.snapshot(runId).pipe(Effect.flatMap((snapshot) => requireAvailable(snapshot.budget)))

export const runnableLimits = (remaining: Remaining): BudgetLimits => {
  const limits: Types.Mutable<BudgetLimits> = {}
  if (remaining.tokens !== undefined) limits.tokens = remaining.tokens
  if (remaining.usd !== undefined && remaining.usd !== "unknown") limits.usd = remaining.usd
  if (remaining.duration !== undefined) limits.duration = remaining.duration
  if (remaining.toolCalls !== undefined) limits.toolCalls = remaining.toolCalls
  if (remaining.children !== undefined) limits.children = remaining.children
  return limits
}

export const replayCheckpoint =
  (budget: RunBudget) =>
  (checkpoint: DriverCheckpoint | undefined): DriverCheckpoint | undefined => {
    if (checkpoint === undefined) return undefined
    const replay = { ...checkpoint, budget }
    const state = Schema.decodeUnknownOption(LoopDriverState)(replay.state)
    if (
      Option.isNone(state) ||
      state.value.postCommitFailure === undefined ||
      (budget.remaining[state.value.postCommitFailure.budget] ?? 0) <= 0
    ) {
      return replay
    }
    const { postCommitFailure: _, ...resumable } = state.value
    return { ...replay, state: resumable }
  }

/** Reconstruct elapsed run time from journaled active and suspended boundaries. */
export const durationForEvents = (events: ReadonlyArray<RunEvent>): Effect.Effect<number> =>
  Effect.gen(function* () {
    const now = yield* DateTime.now
    let activeSince: number | undefined
    let duration = 0
    for (const event of events) {
      const occurredAt = Option.map(DateTime.make(event.occurredAt), DateTime.toEpochMillis).pipe(Option.getOrUndefined)
      if (occurredAt === undefined) continue
      if (event._tag === "RunAccepted" || event._tag === "RunAttemptStarted" || event._tag === "RunResumed") {
        if (activeSince === undefined) activeSince = occurredAt
        continue
      }
      if (
        activeSince !== undefined &&
        (event._tag === "RunWaiting" ||
          event._tag === "BudgetSuspended" ||
          event._tag === "RunCompleted" ||
          event._tag === "RunFailed" ||
          event._tag === "RunCancelled")
      ) {
        duration += Math.max(0, occurredAt - activeSince)
        activeSince = undefined
      }
    }
    return activeSince === undefined ? duration : duration + Math.max(0, DateTime.toEpochMillis(now) - activeSince)
  })
