import { DateTime, Effect, Equal, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import type { ClaimedSchedule, ScheduleReceipt, ScheduleRecord } from "../../../execution/trigger/schedule.js"
import type { MemoryState } from "../../state.js"

const iso = (millis: number): string => DateTime.formatIso(DateTime.makeUnsafe(millis))

export const registerSchedule: {
  (
    record: ScheduleRecord,
  ): (state: MemoryState) => Effect.Effect<readonly [ScheduleReceipt, MemoryState], RuntimeUnavailable>
  (
    state: MemoryState,
    record: ScheduleRecord,
  ): Effect.Effect<readonly [ScheduleReceipt, MemoryState], RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, record: ScheduleRecord) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const existing = state.schedules.get(record.scheduleId)
  if (existing !== undefined) {
    return existing.rrule === record.rrule && Equal.equals(existing.definition, record.definition)
      ? Effect.succeed([{ scheduleId: existing.scheduleId, nextAt: existing.nextAt }, state] as const)
      : Effect.fail(
          RuntimeUnavailable.make({ message: `Schedule ${record.scheduleId} already exists with another definition` }),
        )
  }
  return Effect.succeed([
    { scheduleId: record.scheduleId, nextAt: record.nextAt },
    { ...state, schedules: new Map(state.schedules).set(record.scheduleId, record) },
  ] as const)
})

interface ClaimSchedulesInput {
  readonly ownerId: string
  readonly now: number
  readonly leaseMillis: number
  readonly limit: number
}

export const claimSchedules: {
  (
    input: ClaimSchedulesInput,
  ): (state: MemoryState) => Effect.Effect<readonly [ReadonlyArray<ClaimedSchedule>, MemoryState], RuntimeUnavailable>
  (
    state: MemoryState,
    input: ClaimSchedulesInput,
  ): Effect.Effect<readonly [ReadonlyArray<ClaimedSchedule>, MemoryState], RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: ClaimSchedulesInput) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const claims = new Map(state.scheduleClaims)
  const claimed: Array<ClaimedSchedule> = []
  const due = [...state.schedules.values()]
    .filter((record) => DateTime.toEpochMillis(DateTime.makeUnsafe(record.nextAt)) <= input.now)
    .toSorted(
      (left, right) => left.nextAt.localeCompare(right.nextAt) || left.scheduleId.localeCompare(right.scheduleId),
    )
  for (const record of due) {
    if (claimed.length >= input.limit) break
    const current = claims.get(record.scheduleId)
    if (current !== undefined && DateTime.toEpochMillis(DateTime.makeUnsafe(current.leaseExpiresAt)) > input.now)
      continue
    const claim: ClaimedSchedule = {
      ...record,
      ownerId: input.ownerId,
      leaseExpiresAt: iso(input.now + input.leaseMillis),
    }
    claims.set(record.scheduleId, claim)
    claimed.push(claim)
  }
  return Effect.succeed([claimed, { ...state, scheduleClaims: claims }] as const)
})

interface AdvanceScheduleInput {
  readonly scheduleId: string
  readonly ownerId: string
  readonly occurrence: number
  readonly nextAt: string
  readonly now: number
}

export const advanceSchedule: {
  (input: AdvanceScheduleInput): (state: MemoryState) => Effect.Effect<MemoryState, RuntimeUnavailable>
  (state: MemoryState, input: AdvanceScheduleInput): Effect.Effect<MemoryState, RuntimeUnavailable>
} = Function.dual(2, (state: MemoryState, input: AdvanceScheduleInput) => {
  if (state.closed) return Effect.fail(RuntimeUnavailable.make({ message: "runtime store released" }))
  const claim = state.scheduleClaims.get(input.scheduleId)
  const record = state.schedules.get(input.scheduleId)
  if (claim?.ownerId !== input.ownerId || record?.occurrence !== input.occurrence) return Effect.succeed(state)
  const schedules = new Map(state.schedules).set(input.scheduleId, {
    ...record,
    occurrence: input.occurrence + 1,
    nextAt: input.nextAt,
  })
  const scheduleClaims = new Map(state.scheduleClaims)
  scheduleClaims.delete(input.scheduleId)
  return Effect.succeed({ ...state, schedules, scheduleClaims })
})
