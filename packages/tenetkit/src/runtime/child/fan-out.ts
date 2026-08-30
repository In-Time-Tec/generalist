import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { RunId } from "../run.js"
import { ChildReadiness } from "./readiness.js"

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
  origin: Schema.optionalKey(
    Schema.Struct({
      parentToolCallId: Schema.optionalKey(Schema.String),
      operationKey: Schema.optionalKey(Schema.String),
    }),
  ),
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
