import { Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { FanOutMemberStatus, FanOutStatus, MAX_FAN_OUT_MEMBERS, type FanOutInspection } from "./fan-out.js"

/** @experimental Exact declared child authority used to constrain model-visible selections. */
export interface Authority {
  readonly children: ReadonlyArray<{ readonly selection: string }>
}

const Selection = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const Key = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const PromptText = Schema.String.check(Schema.isNonEmpty())

const selectionFor = (authority?: Authority): Schema.Codec<string> =>
  authority === undefined
    ? Selection
    : Schema.Literals([...new Set(authority.children.map((child) => child.selection))])

const parametersFor = (selection: Schema.Codec<string>) =>
  Schema.Struct({
    selection,
    prompt: PromptText,
  })

const startGroupParametersFor = (selection: Schema.Codec<string>) =>
  Schema.Struct({
    members: Schema.Array(
      Schema.Struct({
        key: Key,
        selection,
        prompt: PromptText,
      }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(MAX_FAN_OUT_MEMBERS)),
    concurrency: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_FAN_OUT_MEMBERS)),
  })

/** @experimental Parameters for one dependent child Run. */
export const Parameters = parametersFor(Selection)
/** @experimental Result of one dependent child Run. */
export const Result = Schema.Union([
  Schema.TaggedStruct("Succeeded", { childRunId: Schema.String, text: Schema.String, turns: Schema.Int }),
  Schema.TaggedStruct("Failed", { childRunId: Schema.String, message: Schema.String }),
  Schema.TaggedStruct("Cancelled", { childRunId: Schema.String, reason: Schema.optionalKey(Schema.String) }),
])

/** @experimental Stable receipt for one member of an admitted child group. */
export const GroupChildReceipt = Schema.Struct({
  key: Key,
  childRunId: Schema.String,
})
/** @experimental */
export type GroupChildReceipt = typeof GroupChildReceipt.Type

/** @experimental Stable receipt returned without waiting for a child group. */
export const GroupReceipt = Schema.Struct({
  groupId: Schema.String,
  children: Schema.Array(GroupChildReceipt),
})
/** @experimental */
export type GroupReceipt = typeof GroupReceipt.Type

/** @experimental Parameters for atomically starting one bounded child group. */
export const StartGroupParameters = startGroupParametersFor(Selection)
/** @experimental */
export type StartGroupParameters = typeof StartGroupParameters.Type

/** @experimental Parameters for durably joining one previously admitted child group. */
export const AwaitGroupParameters = Schema.Struct({ groupId: Schema.String })
/** @experimental */
export type AwaitGroupParameters = typeof AwaitGroupParameters.Type

/** @experimental Ordered terminal or remainder state for one child group member. */
export const GroupChildResult = Schema.Struct({
  key: Key,
  childRunId: Schema.String,
  status: FanOutMemberStatus,
  text: Schema.optionalKey(Schema.String),
  turns: Schema.optionalKey(Schema.Finite),
  message: Schema.optionalKey(Schema.String),
})
/** @experimental */
export type GroupChildResult = typeof GroupChildResult.Type

/** @experimental Ordered durable join result for one child group. */
export const GroupResult = Schema.Struct({
  groupId: Schema.String,
  status: FanOutStatus,
  children: Schema.Array(GroupChildResult),
})
/** @experimental */
export type GroupResult = typeof GroupResult.Type

/** @experimental Name of the blocking dependent-child tool. */
export const toolName = "run_child"
/** @experimental Name of the non-blocking child-group admission tool. */
export const startGroupToolName = "start_child_group"
/** @experimental Name of the durable child-group join tool. */
export const awaitGroupToolName = "await_child_group"

const makeRunChildTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(toolName, {
    description: "Run one declared child Agent and wait for its durable result.",
    parameters: parametersFor(selection),
    success: Result,
  })

const makeStartGroupTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(startGroupToolName, {
    description:
      "Atomically start a bounded group of declared child Agents and return durable receipts immediately. Input: { members: [{ key, selection, prompt }], concurrency }. Pass members as a flat array, not a nested object or JSON string.",
    parameters: startGroupParametersFor(selection),
    success: GroupReceipt,
  })

/** @experimental Blocking tool for dependent singleton child work. */
export const tool = makeRunChildTool(Selection)
/** @experimental Non-blocking tool for bounded independent child work. */
export const startGroupTool = makeStartGroupTool(Selection)
/** @experimental Durable join tool for a previously admitted child group. */
export const awaitGroupTool = Tool.make(awaitGroupToolName, {
  description: "Wait for a child group through one durable suspension and return results in admission order.",
  parameters: AwaitGroupParameters,
  success: GroupResult,
})

/** @experimental Model-facing child tools narrowed to the active Agent's declared child selections. */
export const makeTools = (
  authority: Authority,
): {
  readonly runChild: Tool.Any
  readonly startChildGroup: Tool.Any
  readonly awaitChildGroup: typeof awaitGroupTool
} => {
  const selection = selectionFor(authority)
  return {
    runChild: makeRunChildTool(selection),
    startChildGroup: makeStartGroupTool(selection),
    awaitChildGroup: awaitGroupTool,
  }
}

const messageOf = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"
    ? value.message
    : undefined

/** @experimental Project one persisted fan-out inspection into the model-facing ordered child-group result. */
export const resultFromInspection = (inspection: FanOutInspection): GroupResult => ({
  groupId: inspection.fanOutId,
  status: inspection.status,
  children: inspection.members.map((member) => {
    const result = member.result
    const text =
      typeof result === "object" && result !== null && "text" in result && typeof result.text === "string"
        ? result.text
        : undefined
    const turns =
      typeof result === "object" && result !== null && "turns" in result && typeof result.turns === "number"
        ? result.turns
        : undefined
    const message = messageOf(member.error)
    return {
      key: member.key,
      childRunId: member.childRunId,
      status: member.status,
      ...(text === undefined ? {} : { text }),
      ...(turns === undefined ? {} : { turns }),
      ...(message === undefined ? {} : { message }),
    }
  }),
})

/** @experimental Return the owned group named by an await-child-group suspension, if any. */
export const groupIdFromSuspension = (suspension: unknown): string | undefined => {
  if (typeof suspension !== "object" || suspension === null) return undefined
  if (!("tool_name" in suspension) || suspension.tool_name !== awaitGroupToolName) return undefined
  if (!("token" in suspension) || typeof suspension.token !== "string") return undefined
  if (!("tool_params" in suspension)) return undefined
  const decoded = Schema.decodeUnknownOption(AwaitGroupParameters)(suspension.tool_params)
  return decoded._tag === "Some" && decoded.value.groupId === suspension.token ? decoded.value.groupId : undefined
}
