import { Schema } from "effect"
import { createHash } from "node:crypto"
import { Prompt } from "effect/unstable/ai"
import { AgentRef } from "./agent-ref.js"
import { RunId } from "./run.js"

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

export interface FanOutMemberInput {
  readonly key: string
  readonly agent: AgentRef
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}

export interface FanOutInput {
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<FanOutMemberInput>
  readonly concurrency: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
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
  childRunId: RunId,
  status: FanOutMemberStatus,
  terminalEventId: Schema.optionalKey(Schema.String),
  result: Schema.optionalKey(Schema.Unknown),
  error: Schema.optionalKey(Schema.Unknown),
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
  readonly agent: AgentRef
  readonly prompt: Prompt.Prompt
  readonly sessionId: string
  readonly metadata: Readonly<Record<string, unknown>>
}

export interface AdmitFanOutInput {
  readonly fanOutId: string
  readonly digest: string
  readonly parentRunId: string
  readonly idempotencyKey: string
  readonly members: ReadonlyArray<StoredFanOutMember>
  readonly concurrency: number
  readonly join: FanOutJoin
  readonly remainder: FanOutRemainder
}

const sha256 = (value: string): string => {
  return createHash("sha256").update(value).digest("hex")
}

export const fanOutIdFor = (parentRunId: string, idempotencyKey: string): string =>
  `fanout_${sha256(JSON.stringify([parentRunId, idempotencyKey])).slice(0, 48)}`

export const childRunIdFor = (fanOutId: string, ordinal: number): string => `${fanOutId}_${ordinal}`

export const digestFanOut = (input: Omit<AdmitFanOutInput, "fanOutId" | "digest">): string =>
  sha256(
    JSON.stringify({
      parentRunId: input.parentRunId,
      idempotencyKey: input.idempotencyKey,
      concurrency: input.concurrency,
      join: input.join,
      remainder: input.remainder,
      members: input.members.map((member) => ({
        ordinal: member.ordinal,
        key: member.key,
        childRunId: member.childRunId,
        agent: member.agent,
        prompt: Schema.encodeSync(Prompt.Prompt)(member.prompt),
        sessionId: member.sessionId,
        metadata: member.metadata,
      })),
    }),
  )
