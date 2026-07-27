/** @effect-diagnostics missingPipeableSignature:skip-file */
import { Equal, Option, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { AgentSuspended } from "./agent-event.js"
import type { AnyToolCall } from "./agent-tool-result.js"
import type { Request } from "./tool-executor.js"

export interface SuspensionCheckpoint {
  readonly call: Prompt.ToolCallPart
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly suspension: AgentSuspended
  readonly unresolvedToolCallIndexes: ReadonlyArray<number>
}

export const suspensionCheckpointOption = "@batonfx/core/suspension" as const

export const suspensionMetadata = Schema.Struct({
  token: Schema.String,
  reason: Schema.Literals(["tool-wait", "approval"]),
  tool_call_index: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  tool_call_batch_ids: Schema.Array(Schema.String),
  active_tools: Schema.optional(Schema.Array(Schema.String)),
  activated_skills: Schema.optional(Schema.Array(Schema.String)),
})

export const canonicalSuspensionCall = (
  call: Pick<AnyToolCall, "id" | "name" | "params" | "providerExecuted">,
): AnyToolCall =>
  Response.makePart("tool-call", {
    id: call.id,
    name: call.name,
    params: call.params,
    providerExecuted: call.providerExecuted,
  })

export const unresolvedToolCall = (
  messages: ReadonlyArray<Prompt.Message>,
  toolCallId?: string,
):
  | {
      readonly call: Prompt.ToolCallPart
      readonly messages: ReadonlyArray<Prompt.Message>
      readonly messageIndex: number
      readonly partIndex: number
      readonly toolCallBatch: ReadonlyArray<AnyToolCall>
      readonly unresolvedToolCallIndexes: ReadonlyArray<number>
    }
  | undefined => {
  interface Occurrence {
    readonly call: Prompt.ToolCallPart
    readonly messageIndex: number
    readonly partIndex: number
  }
  const unpaired = new Map<string, Array<Occurrence>>()
  const ambiguous = new Set<string>()
  for (const [messageIndex, message] of messages.entries()) {
    if (typeof message.content === "string") continue
    for (const [partIndex, part] of message.content.entries()) {
      if (part.type === "tool-call") {
        const occurrences = unpaired.get(part.id) ?? []
        if (!part.providerExecuted && occurrences.some(({ call }) => !call.providerExecuted)) ambiguous.add(part.id)
        occurrences.push({ call: part, messageIndex, partIndex })
        unpaired.set(part.id, occurrences)
      }
      if (part.type === "tool-result") {
        const occurrences = unpaired.get(part.id)
        if (occurrences === undefined) continue
        const matched = occurrences.findLastIndex(({ call }) => call.name === part.name)
        if (matched !== -1) occurrences.splice(matched, 1)
        if (occurrences.length === 0) {
          unpaired.delete(part.id)
          ambiguous.delete(part.id)
        }
      }
    }
  }
  const unresolved = [...unpaired.entries()].flatMap(([id, occurrences]) =>
    ambiguous.has(id) ? [] : occurrences.filter(({ call }) => !call.providerExecuted),
  )
  const pending =
    toolCallId === undefined
      ? unresolved.find(({ call }) =>
          Option.isSome(Schema.decodeUnknownOption(suspensionMetadata)(call.options[suspensionCheckpointOption])),
        )
      : unresolved.find(({ call }) => call.id === toolCallId)
  const pendingMessage = pending === undefined ? undefined : messages[pending.messageIndex]
  const unresolvedParts = new Set(
    unresolved.filter(({ messageIndex }) => messageIndex === pending?.messageIndex).map(({ partIndex }) => partIndex),
  )
  const toolCallBatch =
    pendingMessage?.role === "assistant"
      ? pendingMessage.content.flatMap((part) =>
          part.type === "tool-call" && !part.providerExecuted ? [canonicalSuspensionCall(part)] : [],
        )
      : []
  const unresolvedToolCallIndexes =
    pendingMessage?.role === "assistant"
      ? (() => {
          const indexes: Array<number> = []
          let toolCallIndex = 0
          for (const [partIndex, part] of pendingMessage.content.entries()) {
            if (part.type !== "tool-call" || part.providerExecuted) continue
            if (unresolvedParts.has(partIndex)) indexes.push(toolCallIndex)
            toolCallIndex += 1
          }
          return indexes
        })()
      : []
  return pending !== undefined
    ? {
        call: pending.call,
        messages: messages.slice(0, pending.messageIndex),
        messageIndex: pending.messageIndex,
        partIndex: pending.partIndex,
        toolCallBatch,
        unresolvedToolCallIndexes,
      }
    : undefined
}

export const suspensionCheckpoint = (messages: ReadonlyArray<Prompt.Message>): SuspensionCheckpoint | undefined => {
  const unresolved = unresolvedToolCall(messages)
  if (unresolved === undefined) return undefined
  const metadata = Schema.decodeUnknownOption(suspensionMetadata)(unresolved.call.options[suspensionCheckpointOption])
  if (Option.isNone(metadata)) return undefined
  if (
    !Equal.equals(
      metadata.value.tool_call_batch_ids,
      unresolved.toolCallBatch.map((call) => call.id),
    )
  )
    return undefined
  return {
    call: unresolved.call,
    messages: unresolved.messages,
    unresolvedToolCallIndexes: unresolved.unresolvedToolCallIndexes,
    suspension: AgentSuspended.make({
      ...metadata.value,
      tool_call_batch: unresolved.toolCallBatch,
      tool_call_id: unresolved.call.id,
      tool_name: unresolved.call.name,
      tool_params: unresolved.call.params,
    }),
  }
}

export const sameSuspension = (left: AgentSuspended, right: AgentSuspended): boolean =>
  left.token === right.token &&
  left.reason === right.reason &&
  left.tool_call_index === right.tool_call_index &&
  Equal.equals(left.tool_call_batch, right.tool_call_batch) &&
  left.tool_call_id === right.tool_call_id &&
  left.tool_name === right.tool_name &&
  Equal.equals(left.tool_params, right.tool_params) &&
  Equal.equals(left.active_tools, right.active_tools) &&
  Equal.equals(left.activated_skills, right.activated_skills)

export const suspended = (
  call: AnyToolCall,
  toolCallBatch: Request["toolCallBatch"],
  toolCallIndex: number,
  token: string,
  reason: "tool-wait" | "approval",
) =>
  AgentSuspended.make({
    token,
    reason,
    tool_call_index: toolCallIndex,
    tool_call_id: call.id,
    tool_name: call.name,
    tool_params: call.params,
    tool_call_batch: toolCallBatch.calls.map(canonicalSuspensionCall),
  })
