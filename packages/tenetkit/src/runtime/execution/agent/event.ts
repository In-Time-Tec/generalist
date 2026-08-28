import type { AgentEvent } from "../../../core/agent/public/event.js"
import type { Session } from "../../../core/context/public/session.js"
import type { Response } from "effect/unstable/ai"
import type { CompletedModelResponse } from "../../run/event.js"

export type Metadata = AgentEvent.Metadata

export type AgentLoopEvent = Exclude<AgentEvent.Event, AgentEvent.Completed>

type CoreTurnCompleted = Extract<AgentLoopEvent, { readonly _tag: "TurnCompleted" }>

export type TurnCompleted = Omit<CoreTurnCompleted, "transcript">

export interface ModelResponseCommitted {
  readonly _tag: "ModelResponseCommitted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionId: string
  readonly sessionParentId: string | null
  readonly sessionEntryId: string
  readonly digest: string
  readonly usage?: CompletedModelResponse["usage"]
  readonly finishReason?: Response.FinishReason
  readonly metadata?: Metadata
}

/** One terminally interrupted, normalized response retained before Run settlement. */
export interface ModelResponseInterrupted {
  readonly _tag: "ModelResponseInterrupted"
  readonly turn: number
  readonly operationKey: string
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sessionId: string
  readonly sessionParentId: string | null
  readonly sessionEntryId: string
  readonly reason: "cancel" | "failure"
  readonly digest: string
  readonly usage?: CompletedModelResponse["usage"]
  readonly finishReason?: Response.FinishReason
}

/** Runtime history accepts semantic execution facts, never provider transport fragments. */
export type DurableAgentLoopEvent =
  | Exclude<AgentLoopEvent, { readonly _tag: "ModelPart" | "ModelResponseCommitted" | "TurnCompleted" }>
  | TurnCompleted
  | ModelResponseCommitted
  | ModelResponseInterrupted

export const durableEvent = (
  event: Exclude<AgentLoopEvent, { readonly _tag: "ModelPart" | "ModelResponseCommitted" }>,
): DurableAgentLoopEvent => {
  if (event._tag !== "TurnCompleted") return event
  const completed: TurnCompleted = {
    _tag: "TurnCompleted",
    turn: event.turn,
  }
  if (event.usage !== undefined) Object.assign(completed, { usage: event.usage })
  if (event.finishReason !== undefined) Object.assign(completed, { finishReason: event.finishReason })
  if (event.metadata !== undefined) Object.assign(completed, { metadata: event.metadata })
  return completed
}

/** Events accepted by the generic journal path; model outcomes have their own atomic operations. */
export type EmittableAgentLoopEvent = Exclude<
  DurableAgentLoopEvent,
  { readonly _tag: "ModelResponseCommitted" | "ModelResponseInterrupted" }
>

/** Exact stable Session projection committed with an interrupted model response. */
export interface InterruptedSessionEntry {
  readonly sessionId: string
  readonly entryId: string
  readonly parentId: string | null
  readonly content: Session.ModelResponseEntry["content"]
  readonly digest: string
}
