import { Context, Duration, Effect, Option, Stream } from "effect"
import { Prompt, Tool } from "effect/unstable/ai"
import { Agent } from "@batonfx/core"
import type { ClientApproval, LooseServerFrameType, SessionStatus } from "./wire.js"
import type { SessionError, SessionBusy, SessionQueueFull, SubscriberLagged } from "./session-registry-errors.js"

/** @experimental */
export interface SessionInfo {
  readonly sessionId: string
  readonly chatId: string
  readonly status: SessionStatus
  readonly lastSeq: number
  readonly idleSince: Option.Option<number>
  readonly pendingMessages: number
}

/** @experimental */
export interface MemoryOptions<Tools extends Record<string, Tool.Any>, R> {
  readonly agent: Agent.Agent<Tools, R>
  readonly ringBufferCapacity?: number
  readonly subscriberQueueCapacity?: number
  readonly idleTimeout?: Duration.Input
  readonly stripTranscripts?: boolean
  readonly onConcurrentMessage?: "reject" | "enqueue"
  readonly pendingMessageCapacity?: number
  readonly maxConcurrentRuns?: number
}

/** @experimental */
export interface Interface {
  readonly open: (options: {
    readonly sessionId?: string
    readonly chatId?: string
    readonly system?: string
  }) => Effect.Effect<SessionInfo, SessionError>
  readonly send: (
    sessionId: string,
    prompt: Prompt.RawInput,
  ) => Effect.Effect<void, SessionError | SessionBusy | SessionQueueFull>
  readonly resolveApproval: (
    sessionId: string,
    token: string,
    decision: ClientApproval,
  ) => Effect.Effect<void, SessionError | SessionBusy>
  readonly attach: (
    sessionId: string,
    afterSeq?: number,
  ) => Stream.Stream<LooseServerFrameType, SessionError | SubscriberLagged>
  readonly interrupt: (sessionId: string) => Effect.Effect<void, SessionError>
  readonly info: (sessionId: string) => Effect.Effect<SessionInfo, SessionError>
}

/** @experimental */
export class SessionRegistry extends Context.Service<SessionRegistry, Interface>()(
  "@batonfx/transport/SessionRegistry",
) {}
