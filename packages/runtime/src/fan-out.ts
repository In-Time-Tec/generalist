import { Pins } from "@batonfx/core"
import { Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { ExecutableRef } from "./executable-manifest.js"
import { RunId } from "./run.js"
import { ChildReadiness } from "./child-readiness.js"

export const FanOutJoin = Schema.Union([
  Schema.TaggedStruct("AllSuccess", {}),
  Schema.TaggedStruct("AllSettled", {}),
  Schema.TaggedStruct("FirstSuccess", {}),
  Schema.TaggedStruct("Quorum", { required: Schema.Int.check(Schema.isGreaterThan(0)) }),
  Schema.TaggedStruct("BestEffort", {}),
])
export type FanOutJoin = typeof FanOutJoin.Type

export const FanOutRemainder = Schema.Literals(["await", "request-cancel", "terminate", "abandon"])
export type FanOutRemainder = typeof FanOutRemainder.Type

export const FanOutStatus = Schema.Literals(["running", "succeeded", "failed", "cancelled"])
export type FanOutStatus = typeof FanOutStatus.Type

export const FanOutMemberStatus = Schema.Literals([
  "pending",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "abandoned",
])
export type FanOutMemberStatus = typeof FanOutMemberStatus.Type

/** @experimental Durable correlation for the parent operation that admitted one member. */
export const FanOutMemberOrigin = Schema.Struct({
  parentToolCallId: Schema.optionalKey(Schema.String),
  operationKey: Schema.optionalKey(Schema.String),
})
/** @experimental */
export type FanOutMemberOrigin = typeof FanOutMemberOrigin.Type

export interface FanOutMemberInput {
  readonly key: string
  readonly selection: string
  readonly label?: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly metadata?: Readonly<Record<string, unknown>>
  readonly origin?: FanOutMemberOrigin
}

export interface FanOutInput {
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<FanOutMemberInput>
  readonly concurrency?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

export interface InitialFanOutInput extends Omit<FanOutInput, "parentRunId"> {}

export const MAX_FAN_OUT_MEMBERS = 64

/** @experimental Validate the exact normalized member set accepted by every RunStore backend. */
export const validateAdmission = (input: AdmitFanOutInput): string | undefined => {
  if (input.members.length < 1 || input.members.length > MAX_FAN_OUT_MEMBERS) {
    return `fan-out requires between 1 and ${MAX_FAN_OUT_MEMBERS} members`
  }
  if (
    input.concurrency !== undefined &&
    (!Number.isSafeInteger(input.concurrency) || input.concurrency < 1 || input.concurrency > input.members.length)
  ) {
    return "fan-out concurrency must be a positive safe integer no greater than member count"
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
  if (
    input.join._tag === "Quorum" &&
    (!Number.isSafeInteger(input.join.required) ||
      input.join.required < 1 ||
      input.join.required > input.members.length)
  ) {
    return "fan-out quorum must be a positive safe integer no greater than member count"
  }
  return undefined
}

export const FanOutReceipt = Schema.Struct({
  fanOutId: Schema.String,
  parentRunId: RunId,
  childRunIds: Schema.Array(RunId),
  duplicate: Schema.Boolean,
})
export type FanOutReceipt = typeof FanOutReceipt.Type

export const FanOutMemberResult = Schema.Struct({
  ordinal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  key: Schema.String,
  selection: Schema.String,
  label: Schema.optionalKey(Schema.String),
  prompt: Prompt.Prompt,
  origin: Schema.optionalKey(FanOutMemberOrigin),
  childRunId: RunId,
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  readiness: ChildReadiness,
  status: FanOutMemberStatus,
  terminalEventId: Schema.optionalKey(Schema.String),
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
  reason: Schema.optionalKey(Schema.String),
})
export type FanOutMemberResult = typeof FanOutMemberResult.Type

export const FanOutInspection = Schema.Struct({
  fanOutId: Schema.String,
  parentRunId: RunId,
  idempotencyKey: Schema.String,
  status: FanOutStatus,
  join: FanOutJoin,
  remainder: FanOutRemainder,
  concurrency: Schema.Int.check(Schema.isGreaterThan(0)),
  members: Schema.Array(FanOutMemberResult),
})
export type FanOutInspection = typeof FanOutInspection.Type

export interface StoredFanOutMember {
  readonly ordinal: number
  readonly key: string
  readonly childRunId: string
  readonly selection: string
  readonly label?: string
  readonly executableRef: ExecutableRef
  readonly prompt: Prompt.Prompt
  readonly sessionId: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly origin?: FanOutMemberOrigin
}

export interface AdmitFanOutInput {
  readonly fanOutId: string
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<Omit<StoredFanOutMember, "executableRef">>
  readonly concurrency?: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

export const fanOutIdFor: {
  (idempotencyKey: string): (parentRunId: string) => string
  (parentRunId: string, idempotencyKey: string): string
} = Function.dual(
  2,
  (parentRunId: string, idempotencyKey: string): string =>
    `fanout_${Pins.digest([parentRunId, idempotencyKey]).slice(0, 48)}`,
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
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}): string =>
  Pins.digest({
    parentRunId: input.parentRunId,
    idempotencyKey: input.idempotencyKey,
    concurrency: input.concurrency ?? null,
    join: input.join,
    remainder: input.remainder,
    members: input.members.map((member) => ({
      ordinal: member.ordinal,
      key: member.key,
      childRunId: member.childRunId,
      selection: member.selection,
      label: member.label ?? null,
      executableRef: member.executableRef,
      prompt: Schema.encodeSync(Prompt.Prompt)(member.prompt),
      sessionId: member.sessionId,
      metadata: member.metadata,
      origin: member.origin ?? null,
    })),
  })
