import { Equal, Function, Schema } from "effect"
import { Prompt, Response } from "effect/unstable/ai"
import { DuplicateWaitId, type AgentSuspended } from "./event.js"
import {
  canonicalCall,
  waits as checkpointWaits,
  type CanonicalToolCall,
  type ToolBatchCheckpoint,
  type ToolBatchResolution,
  type ToolBatchWait,
} from "./tools/checkpoint.js"
import { successResult, type AnyToolCall, type PendingToolResult } from "./tools/result.js"
import type { ResumeResolution } from "./lifecycle/resume.js"

export interface ToolCheckpoint {
  readonly checkpoint: ToolBatchCheckpoint
  readonly messages: ReadonlyArray<Prompt.Message>
  readonly projectedResults: ReadonlySet<string>
  readonly toolCallBatch: ReadonlyArray<AnyToolCall>
  readonly suspension?: AgentSuspended
}

export interface SuspensionCheckpoint extends ToolCheckpoint {
  readonly suspension: AgentSuspended
}

export const canonicalSuspensionCall = canonicalCall

const assistantCalls = (message: Prompt.Message): ReadonlyArray<CanonicalToolCall> | undefined => {
  if (message.role !== "assistant") return undefined
  const calls: Array<CanonicalToolCall> = []
  for (const part of message.content) {
    if (part.type !== "tool-call" || part.providerExecuted) continue
    const metadata = Schema.decodeOption(Response.ProviderMetadata)(part.options)
    if (metadata._tag === "None") return undefined
    calls.push(canonicalCall({ ...part, metadata: metadata.value }))
  }
  return calls
}

const resultPartsAfter = (messages: ReadonlyArray<Prompt.Message>, messageIndex: number) => {
  const results = new Map<string, Prompt.ToolResultPart>()
  for (const message of messages.slice(messageIndex + 1)) {
    if (message.role !== "tool") break
    for (const part of message.content) {
      if (part.type === "tool-result") results.set(`${part.id}\0${part.name}`, part)
    }
  }
  return results
}

/** Project one candidate authored message against the checkpoint's call states and following results. */
const projectedToolCheckpoint = (
  messages: ReadonlyArray<Prompt.Message>,
  messageIndex: number,
  checkpoint: ToolBatchCheckpoint,
): ToolCheckpoint | undefined => {
  const projected = resultPartsAfter(messages, messageIndex)
  let matched = 0
  let projectionClosed = false
  for (const entry of checkpoint.calls) {
    const result = projected.get(`${entry.call.id}\0${entry.call.name}`)
    if (result === undefined) {
      projectionClosed = true
      continue
    }
    if (
      projectionClosed ||
      entry.state._tag !== "Completed" ||
      !Equal.equals(result, Schema.decodeSync(Prompt.ToolResultPart)(entry.state.result))
    ) {
      return undefined
    }
    matched += 1
  }
  if (matched !== projected.size) return undefined
  return {
    checkpoint,
    messages: messages.slice(0, messageIndex),
    projectedResults: new Set(projected.keys()),
    toolCallBatch: checkpoint.calls.map((entry) =>
      Response.makePart("tool-call", {
        id: entry.call.id,
        name: entry.call.name,
        params: entry.call.params,
        providerExecuted: entry.call.providerExecuted,
        metadata: entry.call.metadata,
      }),
    ),
  }
}

export const checkpointFromHistory: {
  (checkpoint: ToolBatchCheckpoint): (messages: ReadonlyArray<Prompt.Message>) => ToolCheckpoint | undefined
  (messages: ReadonlyArray<Prompt.Message>, checkpoint: ToolBatchCheckpoint): ToolCheckpoint | undefined
} = Function.dual(
  2,
  (messages: ReadonlyArray<Prompt.Message>, checkpoint: ToolBatchCheckpoint): ToolCheckpoint | undefined => {
    const expected = checkpoint.calls.map((entry) => entry.call)
    // A later model response may legally reuse canonical calls from an earlier one. Only an occurrence that
    // projects cleanly against this checkpoint's states and results identifies the authored batch.
    for (const [messageIndex, message] of messages.entries()) {
      const calls = assistantCalls(message)
      if (calls === undefined || !Equal.equals(calls, expected)) continue
      const projected = projectedToolCheckpoint(messages, messageIndex, checkpoint)
      if (projected !== undefined) return projected
    }
    return undefined
  },
)

export const suspensionCheckpoint: {
  (suspension: AgentSuspended): (messages: ReadonlyArray<Prompt.Message>) => SuspensionCheckpoint | undefined
  (messages: ReadonlyArray<Prompt.Message>, suspension: AgentSuspended): SuspensionCheckpoint | undefined
} = Function.dual(
  2,
  (messages: ReadonlyArray<Prompt.Message>, suspension: AgentSuspended): SuspensionCheckpoint | undefined => {
    if (!Equal.equals(suspension.waits, checkpointWaits(suspension.checkpoint))) return undefined
    const checkpoint = checkpointFromHistory(messages, suspension.checkpoint)
    return checkpoint === undefined ? undefined : { ...checkpoint, suspension }
  },
)

/** The first wait identity reused across authored calls in one suspension, if any. */
export const duplicateWaitId = (waits: ReadonlyArray<ToolBatchWait>): DuplicateWaitId | undefined => {
  const firstIndexes = new Map<string, number>()
  for (const [index, wait] of waits.entries()) {
    const firstIndex = firstIndexes.get(wait.waitId)
    if (firstIndex !== undefined) {
      return DuplicateWaitId.make({ waitId: wait.waitId, firstIndex, duplicateIndex: index })
    }
    firstIndexes.set(wait.waitId, index)
  }
  return undefined
}

export const validResolutions: {
  (resolutions: ReadonlyArray<ToolBatchResolution>): (suspension: AgentSuspended) => boolean
  (suspension: AgentSuspended, resolutions: ReadonlyArray<ToolBatchResolution>): boolean
} = Function.dual(2, (suspension: AgentSuspended, resolutions: ReadonlyArray<ToolBatchResolution>): boolean => {
  const waits = new Map(suspension.waits.map((wait) => [wait.waitId, wait] as const))
  if (waits.size !== suspension.waits.length) return false
  const received = new Set<string>()
  for (const entry of resolutions) {
    const wait = waits.get(entry.waitId)
    if (wait === undefined || received.has(entry.waitId)) return false
    received.add(entry.waitId)
    if (wait.reason === "approval" && entry.resolution._tag !== "Approved" && entry.resolution._tag !== "Denied") {
      return false
    }
    if (wait.reason === "tool-wait" && entry.resolution._tag !== "ToolResult" && entry.resolution._tag !== "Signal") {
      return false
    }
    if (entry.resolution._tag === "Signal" && entry.resolution.name !== entry.waitId) return false
  }
  return true
})

export const sameSuspension: {
  (right: AgentSuspended): (left: AgentSuspended) => boolean
  (left: AgentSuspended, right: AgentSuspended): boolean
} = Function.dual(2, (left: AgentSuspended, right: AgentSuspended): boolean => Equal.equals(left, right))

export const resolvedToolResult: {
  (
    resolution: Exclude<ResumeResolution, { readonly _tag: "Approved" | "Denied" }>,
  ): (call: AnyToolCall) => PendingToolResult
  (
    call: AnyToolCall,
    resolution: Exclude<ResumeResolution, { readonly _tag: "Approved" | "Denied" }>,
  ): PendingToolResult
} = Function.dual(
  2,
  (
    call: AnyToolCall,
    resolution: Exclude<ResumeResolution, { readonly _tag: "Approved" | "Denied" }>,
  ): PendingToolResult =>
    resolution._tag === "Signal"
      ? successResult(call, { _tag: "Success", result: resolution.payload, encodedResult: resolution.payload })
      : successResult(call, { _tag: "Success", result: resolution.result, encodedResult: resolution.encodedResult }),
)
