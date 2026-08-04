import { Schema } from "effect"
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

export const RunWait = Schema.Struct({
  waitId: Schema.String,
  reason: Schema.Literals(["tool-wait", "approval", "signal", "timer", "external"]),
  status: Schema.Literals(["open", "responded", "signaled", "cancelled"]),
  resolution: Schema.optionalKey(WaitResolution),
  openedAt: Schema.String,
  closedAt: Schema.optionalKey(Schema.String),
})
export type RunWait = typeof RunWait.Type
