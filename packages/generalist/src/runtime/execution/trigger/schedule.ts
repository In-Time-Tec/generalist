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
})
export type RRule = typeof RRule.Type

/** A recurrence rule is outside Generalist's documented fixed UTC subset. */
export class ScheduleInvalid extends ActionableTaggedError<ScheduleInvalid>()("generalist/runtime/ScheduleInvalid", {
  rrule: Schema.String,
  hint: errorHint("Use FREQ=SECONDLY, MINUTELY, HOURLY, or DAILY with an optional positive integer INTERVAL."),
}) {}

const rulePattern = /^FREQ=(SECONDLY|MINUTELY|HOURLY|DAILY)(?:;INTERVAL=([1-9][0-9]*))?$/
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
    if (frequency === undefined || !Number.isSafeInteger(interval)) {
      return yield* ScheduleInvalid.make({ rrule: input })
    }
    return { frequency, interval }
  })

const frequencyMillis = {
  SECONDLY: 1_000,
  MINUTELY: 60_000,
  HOURLY: 3_600_000,
  DAILY: 86_400_000,
} satisfies Record<Frequency, number>

/** Advance one fixed UTC recurrence from its prior scheduled instant. */
export const nextAt: {
  (afterMillis: number): (rule: RRule) => string
  (rule: RRule, afterMillis: number): string
} = Function.dual(2, (rule: RRule, afterMillis: number): string =>
  DateTime.formatIso(DateTime.makeUnsafe(afterMillis + frequencyMillis[rule.frequency] * rule.interval)),
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

export const ScheduleRecord: Schema.Codec<ScheduleRecord, unknown> = Schema.Struct({
  scheduleId: Schema.String,
  rrule: Schema.String,
  rule: RRule,
  definition: ScheduleDefinition,
  nextAt: Schema.String,
  occurrence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  status: Schema.Literal("active"),
  createdAt: Schema.String,
})

/** Schedule occurrence held by one scheduler lease. */
export interface ClaimedSchedule extends ScheduleRecord {
  readonly ownerId: string
  readonly leaseExpiresAt: string
}

/** Durable identity and first firing instant of a registered recurrence. */
export const ScheduleReceipt = Schema.Struct({ scheduleId: Schema.String, nextAt: Schema.String })
export type ScheduleReceipt = typeof ScheduleReceipt.Type
