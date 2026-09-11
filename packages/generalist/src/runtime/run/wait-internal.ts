import { Equal, Function, Schema } from "effect"
import { RunWait, WaitReason, WaitResolution, type WaitReason as WaitReasonType } from "./wait.js"

export const WaitResponse = Schema.Struct({ waitId: Schema.String, resolution: WaitResolution })
export type WaitResponse = typeof WaitResponse.Type

type ResponseClassification = "open" | "duplicate-identical" | "duplicate-conflict" | "not-open"

export const classifyResponse: {
  (resolution: WaitResolution): (wait: RunWait | undefined) => ResponseClassification
  (wait: RunWait | undefined, resolution: WaitResolution): ResponseClassification
} = Function.dual(2, (wait: RunWait | undefined, resolution: WaitResolution): ResponseClassification => {
  if (wait?.status === "open") return "open"
  if (wait?.status !== "responded" || wait.resolution === undefined) return "not-open"
  return Equal.equals(wait.resolution, resolution) ? "duplicate-identical" : "duplicate-conflict"
})

/** Resolution kinds the generic `respond` control may apply; `signal` owns named signals. */
export type RespondResolution = Exclude<WaitResolution, { readonly _tag: "Signal" }>

/** Whether one generic response kind matches the wait's immutable reason. */
export const acceptsResponseKind: {
  (resolution: RespondResolution): (reason: WaitReasonType) => boolean
  (reason: WaitReasonType, resolution: RespondResolution): boolean
} = Function.dual(2, (reason: WaitReasonType, resolution: RespondResolution): boolean => {
  if (reason._tag === "Approval") return resolution._tag === "Approved" || resolution._tag === "Denied"
  if (reason._tag === "ToolWait" || reason._tag === "AwaitEvent") return resolution._tag === "ToolResult"
  return false
})

export const encodeReason = (reason: WaitReasonType): string => JSON.stringify(reason)

export const decodeReason = (encoded: string): WaitReasonType =>
  Schema.decodeUnknownSync(WaitReason)(JSON.parse(encoded))
