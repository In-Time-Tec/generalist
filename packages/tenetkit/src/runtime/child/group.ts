import { Function, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { FanOutMemberStatus, FanOutStatus, MAX_FAN_OUT_MEMBERS, type FanOutInspection } from "./fan-out.js"
import { ChildDepthExceeded, ChildLimitExceeded } from "../errors.js"
import type { RunEvent } from "../run/event.js"
import { ChildReadiness } from "./readiness.js"

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
    concurrency: Schema.optionalKey(
      Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThanOrEqualTo(MAX_FAN_OUT_MEMBERS)),
    ),
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
  readiness: ChildReadiness,
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
  readiness: ChildReadiness,
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
      "Atomically admit an exact group of declared child Agents and return durable receipts immediately. Members beyond the parent Run's active child capacity queue durably and promote automatically. Optional concurrency may narrow, but never widen, that policy capacity. Pass members as a flat array, not a nested object or JSON string.",
    parameters: startGroupParametersFor(selection),
    success: GroupReceipt,
    failure: Failure,
  })

const makeRunGroupTool = (selection: Schema.Codec<string>): Tool.Any =>
  Tool.make(runGroupToolName, {
    description:
      "Atomically admit an exact group of declared child Agents, durably queue members beyond active capacity, wait for every member to settle, and return complete results in admission order. Optional concurrency may narrow, but never widen, the parent Run's tree-policy capacity.",
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
const makeTools = (authority: Authority) => {
  const selection = selectionFor(authority)
  return {
    runChild: makeRunChildTool(selection),
    runChildGroup: makeRunGroupTool(selection),
    startChildGroup: makeStartGroupTool(selection),
    awaitChildGroup: awaitGroupTool,
  }
}

/** @experimental Runtime-owned child-group tool declarations. */
export const Tools = { make: makeTools }

const MessagePayload = Schema.Struct({ message: Schema.String })
const ResultPayload = Schema.Struct({ text: Schema.String, turns: Schema.Finite })
const ChildMetadata = Schema.Struct({
  childLabel: Schema.optionalKey(Label),
  codeMode: Schema.optionalKey(Schema.Boolean),
  runtimeChildTool: Schema.optionalKey(Schema.Boolean),
  parentRunId: Schema.optionalKey(Schema.String),
  parentToolCallId: Schema.optionalKey(Schema.String),
})
const AgentWaits = Schema.Struct({
  waits: Schema.Array(
    Schema.Struct({
      waitId: Schema.String,
      token: Schema.String,
      call: Schema.Struct({ id: Schema.String, name: Schema.String, params: Schema.Unknown }),
    }),
  ),
})

const SerializedMetadata = Schema.Record(Schema.String, Schema.Unknown)
type SerializedMetadata = typeof SerializedMetadata.Type

type Mutable<Value> = Value extends Value ? { -readonly [Key in keyof Value]: Value[Key] } : never
type MutableResult = Mutable<typeof Result.Type>
type MutableGroupChildResult = { -readonly [Key in keyof GroupChildResult]: GroupChildResult[Key] }

const messageOf = <Value>(value: Value): string | undefined =>
  Schema.decodeUnknownOption(MessagePayload)(value).pipe((decoded) =>
    decoded._tag === "Some" ? decoded.value.message : undefined,
  )

type ChildTerminalEvent = Extract<RunEvent, { readonly _tag: "RunCompleted" | "RunFailed" | "RunCancelled" }>

/** @experimental Project one canonical child terminal event into its blocking parent handoff. */
export const resultFromChildEvent = (input: {
  readonly childRunId: string
  readonly metadata: SerializedMetadata
  readonly event: ChildTerminalEvent
}) => {
  const metadata = Schema.decodeSync(ChildMetadata)(input.metadata)
  if (input.event._tag === "RunCompleted" && metadata.codeMode === true && "value" in input.event.result) {
    return input.event.result.value
  }
  const label = metadata.childLabel
  if (input.event._tag === "RunCompleted") {
    if ("text" in input.event.result) {
      const result: MutableResult = {
        _tag: "Succeeded",
        childRunId: input.childRunId,
        text: input.event.result.text,
        turns: input.event.result.turns,
      }
      if (label !== undefined) result.label = label
      return result
    }
    const result: MutableResult = {
      _tag: "Failed",
      childRunId: input.childRunId,
      message: "child resolved a non-Agent executable",
    }
    if (label !== undefined) result.label = label
    return result
  }
  if (input.event._tag === "RunFailed") {
    const result: MutableResult = {
      _tag: "Failed",
      childRunId: input.childRunId,
      message: input.event.error.message,
    }
    if (label !== undefined) result.label = label
    return result
  }
  const result: MutableResult = {
    _tag: "Cancelled",
    childRunId: input.childRunId,
  }
  if (label !== undefined) result.label = label
  if (input.event.reason !== undefined) result.reason = input.event.reason
  return result
}

/** @experimental Whether persisted child metadata and suspension authorize one direct blocking handoff. */
export const ownsChildSuspension = (input: {
  readonly parentRunId: string
  readonly waitId: string
  readonly childRunId: string
  readonly metadata: SerializedMetadata
  readonly suspension: unknown
}): boolean => {
  const metadata = Schema.decodeOption(ChildMetadata)(input.metadata)
  if (metadata._tag === "None" || metadata.value.runtimeChildTool !== true) return false
  if (metadata.value.parentRunId !== input.parentRunId || metadata.value.parentToolCallId === undefined) return false
  const suspension = Schema.decodeUnknownOption(AgentWaits)(input.suspension)
  return (
    suspension._tag === "Some" &&
    suspension.value.waits.some(
      (wait) =>
        wait.waitId === input.waitId &&
        wait.call.id === metadata.value.parentToolCallId &&
        wait.token === input.childRunId &&
        (wait.call.name === toolName || wait.call.name === "code_mode"),
    )
  )
}

/** @experimental Return the exact aggregate wait owned by one direct child. */
export const waitIdForChild = (input: {
  readonly parentRunId: string
  readonly childRunId: string
  readonly metadata: SerializedMetadata
  readonly suspension: unknown
}): string | undefined => {
  const decoded = Schema.decodeOption(ChildMetadata)(input.metadata)
  if (
    decoded._tag === "None" ||
    decoded.value.runtimeChildTool !== true ||
    decoded.value.parentRunId !== input.parentRunId
  ) {
    return undefined
  }
  const toolCallId = decoded.value.parentToolCallId
  if (toolCallId === undefined) return undefined
  const suspension = Schema.decodeUnknownOption(AgentWaits)(input.suspension)
  if (suspension._tag === "None") return undefined
  return suspension.value.waits.find(
    (wait) =>
      wait.call.id === toolCallId &&
      wait.token === input.childRunId &&
      (wait.call.name === toolName || wait.call.name === "code_mode"),
  )?.waitId
}

/** @experimental Project one persisted fan-out inspection into the model-facing ordered child-group result. */
export const resultFromInspection = (inspection: FanOutInspection): GroupResult => ({
  groupId: inspection.fanOutId,
  status: inspection.status,
  children: inspection.members.map((member) => {
    const result = Schema.decodeUnknownOption(ResultPayload)(member.result)
    const message = messageOf(member.error)
    const child: MutableGroupChildResult = {
      key: member.key,
      selection: member.selection,
      childRunId: member.childRunId,
      depth: member.depth,
      readiness: member.readiness,
      status: member.status,
    }
    if (member.label !== undefined) child.label = member.label
    if (result._tag === "Some") {
      child.text = result.value.text
      child.turns = result.value.turns
    }
    if (message !== undefined) child.message = message
    if (member.reason !== undefined) child.reason = member.reason
    return child
  }),
})

/** @experimental Return the owned group named by an await-child-group suspension, if any. */
export const groupIdFromSuspension = <Suspension>(suspension: Suspension): string | undefined => {
  const decodedSuspension = Schema.decodeUnknownOption(AgentWaits)(suspension)
  if (decodedSuspension._tag === "None") return undefined
  for (const wait of decodedSuspension.value.waits) {
    if (wait.call.name === runGroupToolName) return wait.token
    if (wait.call.name !== awaitGroupToolName) continue
    const decodedParameters = Schema.decodeUnknownOption(AwaitGroupParameters)(wait.call.params)
    if (decodedParameters._tag === "Some" && decodedParameters.value.groupId === wait.token) return wait.token
  }
  return undefined
}

/** @experimental Every exact aggregate wait that owns one child group, in authored order. */
export const groupWaitsFromSuspension = <Suspension>(
  suspension: Suspension,
): ReadonlyArray<{ readonly groupId: string; readonly waitId: string }> => {
  const decodedSuspension = Schema.decodeUnknownOption(AgentWaits)(suspension)
  if (decodedSuspension._tag === "None") return []
  return decodedSuspension.value.waits.flatMap((wait) => {
    if (wait.call.name === runGroupToolName) return [{ groupId: wait.token, waitId: wait.waitId }]
    if (wait.call.name !== awaitGroupToolName) return []
    const decodedParameters = Schema.decodeUnknownOption(AwaitGroupParameters)(wait.call.params)
    return decodedParameters._tag === "Some" && decodedParameters.value.groupId === wait.token
      ? [{ groupId: wait.token, waitId: wait.waitId }]
      : []
  })
}

/** @experimental Return the exact wait that owns one child group in an aggregate Agent suspension. */
export const waitIdForGroup: {
  (groupId: string): <Suspension>(suspension: Suspension) => string | undefined
  <Suspension>(suspension: Suspension, groupId: string): string | undefined
} = Function.dual(2, <Suspension>(suspension: Suspension, groupId: string): string | undefined => {
  const decodedSuspension = Schema.decodeUnknownOption(AgentWaits)(suspension)
  if (decodedSuspension._tag === "None") return undefined
  for (const wait of decodedSuspension.value.waits) {
    if (wait.token !== groupId) continue
    if (wait.call.name === runGroupToolName) return wait.waitId
    if (wait.call.name !== awaitGroupToolName) continue
    const decodedParameters = Schema.decodeUnknownOption(AwaitGroupParameters)(wait.call.params)
    if (decodedParameters._tag === "Some" && decodedParameters.value.groupId === groupId) return wait.waitId
  }
  return undefined
})
