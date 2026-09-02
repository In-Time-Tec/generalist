import { digest as pinDigest } from "../../core/durable/pin.js"
import { Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { ExecutableRef } from "../executable/manifest.js"
import type { FanOutJoin, FanOutRemainder } from "./fan-out.js"
import { promptDigestValue } from "../run/prompt-digest.js"
import type { BudgetLimits } from "../../core/durable/run-budget.js"

export const FanOutMemberOrigin = Schema.Struct({
  parentToolCallId: Schema.optionalKey(Schema.String),
  operationKey: Schema.optionalKey(Schema.String),
})
export type FanOutMemberOrigin = typeof FanOutMemberOrigin.Type

export interface FanOutMemberInput {
  readonly key: string
  readonly selection: string
  readonly label?: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly metadata?: Readonly<Record<string, typeof Schema.Unknown.Type>>
  readonly origin?: FanOutMemberOrigin
  readonly budget?: BudgetLimits
}

export interface FanOutInput {
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<FanOutMemberInput>
  readonly concurrency?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

export type InitialFanOutInput = Omit<FanOutInput, "parentRunId">

export const MAX_FAN_OUT_MEMBERS = 64

export interface StoredFanOutMember {
  readonly ordinal: number
  readonly key: string
  readonly childRunId: string
  readonly selection: string
  readonly label?: string
  readonly executableRef: ExecutableRef
  readonly prompt: Prompt.Prompt
  readonly sessionId: string
  readonly metadata: Readonly<Record<string, typeof Schema.Unknown.Type>>
  readonly origin?: FanOutMemberOrigin
  readonly budget?: BudgetLimits
}

export interface AdmitFanOutInput {
  readonly fanOutId: string
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<Omit<StoredFanOutMember, "executableRef">>
  readonly concurrency?: number
  readonly budgetDivisor?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

const invalidConcurrency = (input: AdmitFanOutInput): boolean =>
  input.concurrency !== undefined &&
  (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > input.members.length)

const invalidBudgetDivisor = (input: AdmitFanOutInput): boolean =>
  input.budgetDivisor !== undefined &&
  (!Number.isSafeInteger(input.budgetDivisor) || input.budgetDivisor < input.members.length)

const invalidQuorum = (input: AdmitFanOutInput): boolean =>
  input.join._tag === "Quorum" &&
  (!Number.isSafeInteger(input.join.required) || input.join.required < 1 || input.join.required > input.members.length)

export const validateAdmission = (input: AdmitFanOutInput): string | undefined => {
  if (input.members.length < 1 || input.members.length > MAX_FAN_OUT_MEMBERS) {
    return `fan-out requires between 1 and ${MAX_FAN_OUT_MEMBERS} members`
  }
  if (invalidConcurrency(input)) {
    return "fan-out concurrency must be a positive safe integer no greater than member count"
  }
  if (invalidBudgetDivisor(input)) {
    return "fan-out budget divisor must be a safe integer no smaller than member count"
  }
  if (new Set(input.members.map((member) => member.key)).size !== input.members.length) {
    return "fan-out member keys must be unique"
  }
  if (new Set(input.members.map((member) => member.childRunId)).size !== input.members.length) {
    return "fan-out child Run ids must be unique"
  }
  if (input.members.some((member, ordinal) => member.ordinal !== ordinal)) {
    return "fan-out member ordinals must be dense and ordered from zero"
  }
  if (invalidQuorum(input)) {
    return "fan-out quorum must be a positive safe integer no greater than member count"
  }
  return undefined
}

export const fanOutIdFor: {
  (idempotencyKey: string): (parentRunId: string) => string
  (parentRunId: string, idempotencyKey: string): string
} = Function.dual(
  2,
  (parentRunId: string, idempotencyKey: string): string =>
    `fanout_${pinDigest([parentRunId, idempotencyKey]).slice(0, 48)}`,
)

export const childRunIdFor: {
  (ordinal: number): (fanOutId: string) => string
  (fanOutId: string, ordinal: number): string
} = Function.dual(2, (fanOutId: string, ordinal: number): string => `${fanOutId}_${ordinal}`)

export const digestFanOut = (input: {
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<StoredFanOutMember>
  readonly concurrency?: number
  readonly budgetDivisor?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}): string =>
  pinDigest({
    parentRunId: input.parentRunId,
    idempotencyKey: input.idempotencyKey,
    concurrency: input.concurrency ?? null,
    budgetDivisor: input.budgetDivisor ?? null,
    join: input.join,
    remainder: input.remainder,
    members: input.members.map((member) => ({
      ordinal: member.ordinal,
      key: member.key,
      childRunId: member.childRunId,
      selection: member.selection,
      label: member.label ?? null,
      executableRef: member.executableRef,
      prompt: promptDigestValue(member.prompt),
      sessionId: member.sessionId,
      metadata: member.metadata,
      origin: member.origin ?? null,
      budget: member.budget ?? null,
    })),
  })
