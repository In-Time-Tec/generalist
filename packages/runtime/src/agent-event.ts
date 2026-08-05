import type { AgentEvent } from "@batonfx/core"

export type Metadata = Readonly<Record<string, unknown>>

export type AgentLoopEvent = Exclude<AgentEvent.Event, AgentEvent.Completed>
