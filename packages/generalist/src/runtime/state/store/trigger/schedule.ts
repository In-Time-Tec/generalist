import { type PreparedObservation, occurredAtMillis } from "../../observation.js"
import { DateTime, Effect, Equal, Function } from "effect"
import { RuntimeUnavailable } from "../../../errors.js"
import type { ClaimedSchedule, ScheduleReceipt, ScheduleRecord } from "../../../execution/trigger/schedule.js"
import type { RuntimeState } from "../../projection.js"

const iso = (millis: number): string => DateTime.formatIso(DateTime.makeUnsafe(millis))

export const registerSchedule: {
  (
    record: ScheduleRecord,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<readonly [ScheduleReceipt, RuntimeState], RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    record: ScheduleRecord,
  ): Effect.Effect<readonly [ScheduleReceipt, RuntimeState], RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, record: ScheduleRecord) => {
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
  readonly leaseMillis: number
  readonly limit: number
}

export const claimSchedules: {
  (
    input: ClaimSchedulesInput,
  ): (
    state: RuntimeState,
  ) => Effect.Effect<readonly [ReadonlyArray<ClaimedSchedule>, RuntimeState], RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    input: ClaimSchedulesInput,
  ): Effect.Effect<readonly [ReadonlyArray<ClaimedSchedule>, RuntimeState], RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, input: ClaimSchedulesInput) =>
  Effect.gen(function* () {
    if (state.closed) return yield* RuntimeUnavailable.make({ message: "runtime store released" })
    const now = yield* occurredAtMillis
    const claims = new Map(state.scheduleClaims)
    const claimed: Array<ClaimedSchedule> = []
    const due = [...state.schedules.values()]
      .filter((record) => DateTime.toEpochMillis(DateTime.makeUnsafe(record.nextAt)) <= now)
      .toSorted(
        (left, right) => left.nextAt.localeCompare(right.nextAt) || left.scheduleId.localeCompare(right.scheduleId),
      )
    for (const record of due) {
      if (claimed.length >= input.limit) break
      const current = claims.get(record.scheduleId)
      if (current !== undefined && DateTime.toEpochMillis(DateTime.makeUnsafe(current.leaseExpiresAt)) > now) continue
      const claim: ClaimedSchedule = {
        ...record,
        ownerId: input.ownerId,
        leaseExpiresAt: iso(now + input.leaseMillis),
      }
      claims.set(record.scheduleId, claim)
      claimed.push(claim)
    }
    return [claimed, { ...state, scheduleClaims: claims }] as const
  }),
)

interface AdvanceScheduleInput {
  readonly scheduleId: string
  readonly ownerId: string
  readonly occurrence: number
  readonly nextAt: string
}

export const advanceSchedule: {
  (
    input: AdvanceScheduleInput,
  ): (state: RuntimeState) => Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
  (
    state: RuntimeState,
    input: AdvanceScheduleInput,
  ): Effect.Effect<RuntimeState, RuntimeUnavailable, PreparedObservation>
} = Function.dual(2, (state: RuntimeState, input: AdvanceScheduleInput) => {
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
