import { DateTime, Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { RunBudget } from "../../../core/durable/run-budget.js"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"
import { PinnedExecutable, type PinnedExecutable as PinnedExecutableType } from "../../executable/manifest.js"
import {
  ExecutableRegistration,
  type ExecutableRegistration as ExecutableRegistrationType,
} from "../../executable/registration.js"

const Frequency = Schema.Literals(["SECONDLY", "MINUTELY", "HOURLY", "DAILY"])
export type Frequency = typeof Frequency.Type

/** Normalized fixed-interval subset of RFC 5545 recurrence rules. */
export const RRule = Schema.Struct({
  frequency: Frequency,
  interval: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  hour: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(23))),
})
export type RRule = typeof RRule.Type

/** A recurrence rule is outside Generalist's documented fixed UTC subset. */
export class ScheduleInvalid extends ActionableTaggedError<ScheduleInvalid>()("generalist/runtime/ScheduleInvalid", {
  rrule: Schema.String,
  hint: errorHint(
    "Use FREQ=SECONDLY, MINUTELY, HOURLY, or DAILY with an optional positive integer INTERVAL; DAILY may also set BYHOUR=0..23 UTC.",
  ),
}) {}

const rulePattern =
  /^FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY)(?:;INTERVAL=([1-9][0-9]*))?(?:;BYHOUR=([0-9]|1[0-9]|2[0-3]))?$/
const parseFrequency = (value: string | undefined): Frequency | undefined => {
  switch (value) {
    case "SECONDLY":
    case "MINUTELY":
    case "HOURLY":
    case "DAILY":
      return value
    default:
      return undefined
  }
}

/** Parse the supported `FREQ=...;INTERVAL=...` UTC interval subset. */
export const parseRRule = (input: string): Effect.Effect<RRule, ScheduleInvalid> =>
  Effect.gen(function* () {
    const normalized = input.trim().toUpperCase()
    const match = rulePattern.exec(normalized)
    const interval = Number(match?.[2] ?? 1)
    const frequency = parseFrequency(match?.[1])
    const hour = match?.[3] === undefined ? undefined : Number(match[3])
    if (frequency === undefined || !Number.isSafeInteger(interval) || (hour !== undefined && frequency !== "DAILY")) {
      return yield* ScheduleInvalid.make({ rrule: input })
    }
    return hour === undefined ? { frequency, interval } : { frequency, interval, hour }
  })

const frequencyMillis = {
  SECONDLY: 1_000,
  MINUTELY: 60_000,
  HOURLY: 3_600_000,
  DAILY: 86_400_000,
} satisfies Record<Frequency, number>

/** Inclusive epoch-millisecond magnitude a JavaScript `Date` (and `DateTime`) can represent. */
const dateRangeMillis = 8_640_000_000_000_000

const representable = (millis: number): boolean => Number.isFinite(millis) && Math.abs(millis) <= dateRangeMillis

/** Canonical persisted form of one supported rule. */
export const formatRRule = (rule: RRule): string =>
  `FREQ=${rule.frequency}${rule.interval === 1 ? "" : `;INTERVAL=${rule.interval}`}${rule.hour === undefined ? "" : `;BYHOUR=${rule.hour}`}`

const unrepresentable = (rule: RRule) => ScheduleInvalid.make({ rrule: formatRRule(rule) })

/**
 * Advance one fixed UTC recurrence from its prior scheduled instant.
 * Rules whose next instant leaves the representable `DateTime` range fail typed instead of defecting.
 */
export const nextAt: {
  (afterMillis: number): (rule: RRule) => Effect.Effect<string, ScheduleInvalid>
  (rule: RRule, afterMillis: number): Effect.Effect<string, ScheduleInvalid>
} = Function.dual(2, (rule: RRule, afterMillis: number) =>
  Effect.gen(function* () {
    if (!representable(afterMillis)) {
      return yield* unrepresentable(rule)
    }
    if (rule.hour === undefined) {
      const nextMillis = afterMillis + frequencyMillis[rule.frequency] * rule.interval
      if (!representable(nextMillis)) {
        return yield* unrepresentable(rule)
      }
      return DateTime.formatIso(DateTime.makeUnsafe(nextMillis))
    }
    const after = DateTime.makeUnsafe(afterMillis)
    const sameDayMillis = DateTime.toEpochMillis(
      DateTime.setPartsUtc(after, { hour: rule.hour, minute: 0, second: 0, millisecond: 0 }),
    )
    const nextMillis =
      sameDayMillis > afterMillis ? sameDayMillis : sameDayMillis + frequencyMillis.DAILY * rule.interval
    if (!representable(nextMillis)) {
      return yield* unrepresentable(rule)
    }
    return DateTime.formatIso(DateTime.makeUnsafe(nextMillis))
  }),
)

/** Persisted fresh-Run admission data for one recurring schedule. */
export interface ScheduleDefinition {
  readonly executable: PinnedExecutableType
  readonly registrations: ReadonlyArray<ExecutableRegistrationType>
  readonly sessionId: string
  readonly prompt: Prompt.Prompt
  readonly budget: RunBudget
}

export const ScheduleDefinition: Schema.Codec<ScheduleDefinition, unknown> = Schema.Struct({
  executable: PinnedExecutable,
  registrations: Schema.Array(ExecutableRegistration),
  sessionId: Schema.String,
  prompt: Prompt.Prompt,
  budget: RunBudget,
})

/** One durable recurring schedule. */
export interface ScheduleRecord {
  readonly scheduleId: string
  readonly rrule: string
  readonly rule: RRule
  readonly definition: ScheduleDefinition
  readonly nextAt: string
  readonly occurrence: number
  readonly status: "active"
  readonly createdAt: string
}

export const ScheduleRecord = Schema.Struct({
  scheduleId: Schema.String,
  rrule: Schema.String,
  rule: RRule,
  definition: ScheduleDefinition,
  nextAt: Schema.String,
  occurrence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  status: Schema.Literal("active"),
  createdAt: Schema.String,
}) satisfies Schema.Codec<ScheduleRecord, unknown>

/** Schedule occurrence held by one scheduler lease. */
export interface ClaimedSchedule extends ScheduleRecord {
  readonly ownerId: string
  readonly leaseExpiresAt: string
}

/** Durable identity and first firing instant of a registered recurrence. */
export const ScheduleReceipt = Schema.Struct({ scheduleId: Schema.String, nextAt: Schema.String })
export type ScheduleReceipt = typeof ScheduleReceipt.Type
