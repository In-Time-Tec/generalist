import { Schema } from "effect"
import { Request as ApprovalRequest } from "../operation/approval.js"

export const WaitResolution = Schema.Union([
  Schema.TaggedStruct("Approved", {}),
  Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  Schema.TaggedStruct("Signal", {
    name: Schema.String,
    payload: Schema.optionalKey(Schema.Unknown),
  }),
])
export type WaitResolution = typeof WaitResolution.Type

/** @experimental Typed reason and request payload for one durable wait. */
export const WaitReason = Schema.Union([
  Schema.TaggedStruct("ToolWait", {}),
  Schema.TaggedStruct("Approval", { request: ApprovalRequest }),
  Schema.TaggedStruct("Signal", { name: Schema.String }),
  Schema.TaggedStruct("Timer", { dueAt: Schema.optionalKey(Schema.String) }),
  Schema.TaggedStruct("External", { capability: Schema.optionalKey(Schema.String) }),
])
export type WaitReason = typeof WaitReason.Type

export const RunWait = Schema.Struct({
  waitId: Schema.String,
  reason: WaitReason,
  status: Schema.Literals(["open", "responded", "signaled", "cancelled"]),
  resolution: Schema.optionalKey(WaitResolution),
  openedAt: Schema.String,
  closedAt: Schema.optionalKey(Schema.String),
})
export type RunWait = typeof RunWait.Type

/** @experimental Construct the approval reason shared by Runtime producers and controls. */
export const approvalReason = (request: ApprovalRequest): WaitReason => ({
  _tag: "Approval",
  request,
})
