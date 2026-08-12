import { Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { FanOutMemberStatus, FanOutStatus, MAX_FAN_OUT_MEMBERS, type FanOutInspection } from "./fan-out.js"
import { ChildDepthExceeded, ChildLimitExceeded } from "./errors.js"
import type { RunEvent } from "./run-event.js"

/** @experimental Exact declared child authority used to constrain model-visible selections. */
export interface Authority {
  readonly children: ReadonlyArray<{ readonly selection: string }>
}

const Selection = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const Key = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const PromptText = Schema.String.check(Schema.isNonEmpty())
const Label = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(256))

/** @experimental Typed policy failures preserved through model-facing child tools. */
export const Failure = Schema.Union([ChildDepthExceeded, ChildLimitExceeded, Schema.Struct({ message: Schema.String })])
/** @experimental */
export type Failure = typeof Failure.Type

const selectionFor = (authority?: Authority): Schema.Codec<string> =>
  authority === undefined
    ? Selection
    : Schema.Literals([...new Set(authority.children.map((child) => child.selection))])

const parametersFor = (selection: Schema.Codec<string>) =>
  Schema.Struct({
    selection,
    label: Schema.optionalKey(Label),
    prompt: PromptText,
  })

const startGroupParametersFor = (selection: Schema.Codec<string>) =>
  Schema.Struct({
    members: Schema.Array(
      Schema.Struct({
        key: Key,
        selection,
        label: Schema.optionalKey(Label),
        prompt: PromptText,
      }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(MAX_FAN_OUT_MEMBERS)),
    concurrency: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_FAN_OUT_MEMBERS)),
  })

/** @experimental Parameters for one dependent child Run. */
export const Parameters = parametersFor(Selection)
/** @experimental Result of one dependent child Run. */
export const Result = Schema.Union([
  Schema.TaggedStruct("Succeeded", {
    childRunId: Schema.String,
    label: Schema.optionalKey(Label),
    text: Schema.String,
    turns: Schema.Int,
  }),
  Schema.TaggedStruct("Failed", {
    childRunId: Schema.String,
    label: Schema.optionalKey(Label),
    message: Schema.String,
  }),
  Schema.TaggedStruct("Cancelled", {
    childRunId: Schema.String,
    label: Schema.optionalKey(Label),
    reason: Schema.optionalKey(Schema.String),
  }),
])

/** @experimental Stable receipt for one member of an admitted child group. */
export const GroupChildReceipt = Schema.Struct({
  key: Key,
  selection: Selection,
  label: Schema.optionalKey(Label),
  childRunId: Schema.String,
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
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
  selection: Selection,
  label: Schema.optionalKey(Label),
  childRunId: Schema.String,
  depth: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  status: FanOutMemberStatus,
  text: Schema.optionalKey(Schema.String),
  turns: Schema.optionalKey(Schema.Finite),
  message: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
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
/** @experimental Name of the blocking atomic child-group tool. */
export const runGroupToolName = "run_child_group"

const makeRunChildTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(toolName, {
    description: "Run one declared child Agent and wait for its durable result.",
    parameters: parametersFor(selection),
    success: Result,
    failure: Failure,
  })

const makeStartGroupTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(startGroupToolName, {
    description:
      "Atomically start a bounded group of declared child Agents and return durable receipts immediately. Input: { members: [{ key, selection, prompt }], concurrency }. Pass members as a flat array, not a nested object or JSON string.",
    parameters: startGroupParametersFor(selection),
    success: GroupReceipt,
    failure: Failure,
  })

const makeRunGroupTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(runGroupToolName, {
    description:
      "Atomically admit an exact bounded group of declared child Agents, wait for every member to settle, and return complete results in admission order.",
    parameters: startGroupParametersFor(selection),
    success: GroupResult,
    failure: Failure,
  })

/** @experimental Blocking tool for dependent singleton child work. */
export const tool = makeRunChildTool(Selection)
/** @experimental Non-blocking tool for bounded independent child work. */
export const startGroupTool = makeStartGroupTool(Selection)
/** @experimental Blocking tool for one exact all-settled child group. */
export const runGroupTool = makeRunGroupTool(Selection)
/** @experimental Durable join tool for a previously admitted child group. */
export const awaitGroupTool = Tool.make(awaitGroupToolName, {
  description: "Wait for a child group through one durable suspension and return results in admission order.",
  parameters: AwaitGroupParameters,
  success: GroupResult,
  failure: Failure,
})

/** @experimental Model-facing child tools narrowed to the active Agent's declared child selections. */
export const makeTools = (
  authority: Authority,
): {
  readonly runChild: Tool.Any
  readonly runChildGroup: Tool.Any
  readonly startChildGroup: Tool.Any
  readonly awaitChildGroup: typeof awaitGroupTool
} => {
  const selection = selectionFor(authority)
  return {
    runChild: makeRunChildTool(selection),
    runChildGroup: makeRunGroupTool(selection),
    startChildGroup: makeStartGroupTool(selection),
    awaitChildGroup: awaitGroupTool,
  }
}

const messageOf = (value: unknown): string | undefined =>
  typeof value === "object" && value !== null && "message" in value && typeof value.message === "string"
    ? value.message
    : undefined

type ChildTerminalEvent = Extract<RunEvent, { readonly _tag: "RunCompleted" | "RunFailed" | "RunCancelled" }>

const labelFromMetadata = (metadata: Readonly<Record<string, unknown>>): string | undefined => {
  const label = metadata.childLabel
  return typeof label === "string" && label.length > 0 && label.length <= 256 ? label : undefined
}

/** @experimental Project one canonical child terminal event into its blocking parent handoff. */
export const resultFromChildEvent = (input: {
  readonly childRunId: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly event: ChildTerminalEvent
}): unknown => {
  if (input.event._tag === "RunCompleted" && input.metadata.codeMode === true && "value" in input.event.result) {
    return input.event.result.value
  }
  const label = labelFromMetadata(input.metadata)
  if (input.event._tag === "RunCompleted") {
    return "text" in input.event.result
      ? {
          _tag: "Succeeded" as const,
          childRunId: input.childRunId,
          ...(label === undefined ? {} : { label }),
          text: input.event.result.text,
          turns: input.event.result.turns,
        }
      : {
          _tag: "Failed" as const,
          childRunId: input.childRunId,
          ...(label === undefined ? {} : { label }),
          message: "child resolved a non-Agent executable",
        }
  }
  if (input.event._tag === "RunFailed") {
    return {
      _tag: "Failed" as const,
      childRunId: input.childRunId,
      ...(label === undefined ? {} : { label }),
      message: input.event.error.message,
    }
  }
  return {
    _tag: "Cancelled" as const,
    childRunId: input.childRunId,
    ...(label === undefined ? {} : { label }),
    ...(input.event.reason === undefined ? {} : { reason: input.event.reason }),
  }
}

/** @experimental Whether persisted child metadata and suspension authorize one direct blocking handoff. */
export const ownsChildSuspension = (input: {
  readonly parentRunId: string
  readonly waitId: string
  readonly childRunId: string
  readonly metadata: Readonly<Record<string, unknown>>
  readonly suspension: unknown
}): boolean => {
  if (input.metadata.runtimeChildTool !== true) return false
  if (input.metadata.parentRunId !== input.parentRunId || input.metadata.parentToolCallId !== input.waitId) return false
  const suspension = input.suspension
  if (typeof suspension !== "object" || suspension === null) return false
  if (!("tool_name" in suspension) || (suspension.tool_name !== toolName && suspension.tool_name !== "code_mode"))
    return false
  return "token" in suspension && suspension.token === input.childRunId
}

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
      selection: member.selection,
      ...(member.label === undefined ? {} : { label: member.label }),
      childRunId: member.childRunId,
      depth: member.depth,
      status: member.status,
      ...(text === undefined ? {} : { text }),
      ...(turns === undefined ? {} : { turns }),
      ...(message === undefined ? {} : { message }),
      ...(member.reason === undefined ? {} : { reason: member.reason }),
    }
  }),
})

/** @experimental Return the owned group named by an await-child-group suspension, if any. */
export const groupIdFromSuspension = (suspension: unknown): string | undefined => {
  if (typeof suspension !== "object" || suspension === null) return undefined
  if (!("tool_name" in suspension)) return undefined
  if (suspension.tool_name !== awaitGroupToolName && suspension.tool_name !== runGroupToolName) return undefined
  if (!("token" in suspension) || typeof suspension.token !== "string") return undefined
  if (suspension.tool_name === runGroupToolName) return suspension.token
  if (!("tool_params" in suspension)) return undefined
  const decoded = Schema.decodeUnknownOption(AwaitGroupParameters)(suspension.tool_params)
  return decoded._tag === "Some" && decoded.value.groupId === suspension.token ? decoded.value.groupId : undefined
}
