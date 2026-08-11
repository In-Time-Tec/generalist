import type { AgentEvent } from "@batonfx/core"
import type { Prompt } from "effect/unstable/ai"
import type { CompletedModelResponse } from "./run-event.js"

export type Metadata = Readonly<Record<string, unknown>>

export type AgentLoopEvent = Exclude<AgentEvent.Event, AgentEvent.Completed>

/** One terminally interrupted, normalized response retained before Run settlement. */
export interface ModelResponseInterrupted {
  readonly _tag: "ModelResponseInterrupted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly response: CompletedModelResponse
  readonly reason: "cancel" | "failure"
  readonly digest: string
}

/** Runtime history accepts semantic execution facts, never provider transport fragments. */
export type DurableAgentLoopEvent = Exclude<AgentLoopEvent, { readonly _tag: "ModelPart" }> | ModelResponseInterrupted

/** Events accepted by the generic journal path; model outcomes have their own atomic operations. */
export type EmittableAgentLoopEvent = Exclude<
  DurableAgentLoopEvent,
  { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }
>

/** One semantic model outbox event transactionally derived from its canonical operation outcome. */
export type ModelResponseCommitted = Extract<DurableAgentLoopEvent, { readonly _tag: "ModelResponseCommitted" }>

/** Exact stable Session projection committed with an interrupted model response. */
export interface InterruptedSessionEntry {
  readonly sessionId: string
  readonly entryId: string
  readonly message: Prompt.AssistantMessage
  readonly digest: string
}
