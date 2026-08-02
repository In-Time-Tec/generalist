import type { Fiber, Queue, Scope, Semaphore } from "effect"
import type { Chat } from "effect/unstable/ai"
import type { ToolProgress } from "./agent-event.js"

/** @internal Resources acquired and released by one Agent.stream invocation. */
export interface AgentRunResources {
  readonly chat: Chat.Service
  readonly scope: Scope.Scope
  readonly persistenceSemaphore: Semaphore.Semaphore | undefined
  readonly toolFibers: ReadonlyArray<Fiber.Fiber<unknown, unknown>>
  readonly progressQueues: ReadonlyArray<Queue.Queue<ToolProgress, unknown>>
  readonly finalizers: ReadonlyArray<() => void>
}

/** @internal Creates an empty resource ledger for a run owner. */
export const emptyAgentRunResources = (chat: Chat.Service, scope: Scope.Scope): AgentRunResources => ({
  chat,
  scope,
  persistenceSemaphore: undefined,
  toolFibers: [],
  progressQueues: [],
  finalizers: [],
})
