import { Equal, Function, Schema } from "effect"
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

/** @experimental One exact terminal resolution targeted to one durable wait. */
export const WaitResponse = Schema.Struct({ waitId: Schema.String, resolution: WaitResolution })
export type WaitResponse = typeof WaitResponse.Type

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

/** @experimental Classify one response against the immutable history of its exact wait. */
type ResponseClassification = "open" | "duplicate-identical" | "duplicate-conflict" | "not-open"
export const classifyResponse: {
  (resolution: WaitResolution): (wait: RunWait | undefined) => ResponseClassification
  (wait: RunWait | undefined, resolution: WaitResolution): ResponseClassification
} = Function.dual(2, (wait: RunWait | undefined, resolution: WaitResolution): ResponseClassification => {
  if (wait?.status === "open") return "open"
  if (wait?.status !== "responded" || wait.resolution === undefined) return "not-open"
  return Equal.equals(wait.resolution, resolution) ? "duplicate-identical" : "duplicate-conflict"
})

/** @experimental Construct the approval reason shared by Runtime producers and controls. */
export const approvalReason = (request: ApprovalRequest): WaitReason => ({
  _tag: "Approval",
  request,
})

/** @experimental Encode a wait reason for opaque SQL persistence. */
export const encodeReason = (reason: WaitReason): string => JSON.stringify(reason)

/** @experimental Decode an opaque persisted wait reason. */
export const decodeReason = (encoded: string): WaitReason => Schema.decodeUnknownSync(WaitReason)(JSON.parse(encoded))
