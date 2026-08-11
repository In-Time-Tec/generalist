import type { AgentEvent } from "@batonfx/core"

export type Metadata = Readonly<Record<string, unknown>>

export type AgentLoopEvent = Exclude<AgentEvent.Event, AgentEvent.Completed>

/** Runtime history accepts semantic execution facts, never provider transport fragments. */
export type DurableAgentLoopEvent = Exclude<AgentLoopEvent, { readonly _tag: "ModelPart" }>

/** Events accepted by the generic journal path; model completion has its own atomic operation. */
export type EmittableAgentLoopEvent = Exclude<DurableAgentLoopEvent, { readonly _tag: "ModelResponseCommitted" }>

/** One semantic model outbox event transactionally derived from its canonical operation outcome. */
export type ModelResponseCommitted = Extract<DurableAgentLoopEvent, { readonly _tag: "ModelResponseCommitted" }>
