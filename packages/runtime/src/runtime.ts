import { Context, Effect, Layer, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Agent } from "@batonfx/core"
import type { Address } from "./address.js"
import type { AgentRef } from "./agent-ref.js"
import type { Cursor } from "./cursor.js"
import type {
  AddressNotFound,
  AgentNotRegistered,
  AgentVersionUnavailable,
  CursorExpired,
  IdempotencyConflict,
  RunIdConflict,
  SteeringConflict,
  ResponseConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
  SubscriberLagged,
  WaitNotOpen,
} from "./errors.js"
import type { Metadata } from "./message.js"
import type { RunInspection, RunReceipt, RunSnapshot, RunStatus } from "./run.js"
import type { RunEvent } from "./run-event.js"
import type { WaitResolution } from "./run-wait.js"

export interface AgentRegistration {
  readonly ref: AgentRef
  readonly agent: Agent.Agent<any, any, any, any>
  readonly services?: Layer.Layer<any>
}

export interface AddressBinding {
  readonly address: Address
  readonly agent: AgentRef
}

export interface LayerOptions {
  readonly agents: ReadonlyArray<AgentRegistration>
  readonly addresses: ReadonlyArray<AddressBinding>
  readonly subscriberQueueCapacity?: number
}

export interface SendInput {
  readonly runId?: string
  readonly to: Address
  readonly from?: Address
  readonly sessionId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly messageId?: string
  readonly causationId?: string
  readonly correlationId?: string
  readonly inReplyTo?: string
  readonly metadata?: Metadata
}

export interface SpawnInput {
  readonly parentRunId: string
  readonly invocationId: string
  readonly agent: AgentRef
  readonly prompt: Prompt.Prompt | Prompt.RawInput
  readonly sessionId?: string
  readonly idempotencyKey?: string
  readonly messageId?: string
  readonly correlationId?: string
  readonly metadata?: Metadata
}

export interface EventsInput {
  readonly runId: string
  readonly cursor?: Cursor
}

export interface HistoryInput extends EventsInput {
  readonly limit: number
}

export interface ListInput {
  readonly status?: RunStatus
  readonly limit: number
}

export interface RespondInput {
  readonly runId: string
  readonly waitId: string
  readonly resolution: Exclude<WaitResolution, { readonly _tag: "Signal" }>
  readonly idempotencyKey?: string
}

export interface SignalInput {
  readonly runId: string
  readonly name: string
  readonly payload?: unknown
}

export interface CancelInput {
  readonly runId: string
  readonly reason?: string
}

export interface SteerInput {
  readonly runId: string
  readonly idempotencyKey: string
  readonly prompt: Prompt.Prompt | Prompt.RawInput
}

export type SendError = AddressNotFound | IdempotencyConflict | RunIdConflict | AgentNotRegistered | RuntimeUnavailable
export type SpawnError =
  | RunNotFound
  | AgentVersionUnavailable
  | AgentNotRegistered
  | IdempotencyConflict
  | RuntimeUnavailable
export type EventsError = RunNotFound | CursorExpired | SubscriberLagged | RuntimeUnavailable
export type RespondError = RunNotFound | WaitNotOpen | ResponseConflict | RunTerminal | RuntimeUnavailable
export type SignalError = RunNotFound | RunTerminal | RuntimeUnavailable
export type CancelError = RunNotFound | RuntimeUnavailable
export type SteerError = RunNotFound | RunTerminal | SteeringConflict | RuntimeUnavailable
export type InspectError = RunNotFound | RuntimeUnavailable

export interface Interface {
  readonly send: (input: SendInput) => Effect.Effect<RunReceipt, SendError>
  readonly spawn: (input: SpawnInput) => Effect.Effect<RunReceipt, SpawnError>
  readonly events: (input: EventsInput) => Stream.Stream<RunEvent, EventsError>
  readonly snapshot: (runId: string) => Effect.Effect<RunSnapshot, InspectError>
  readonly history: (input: HistoryInput) => Effect.Effect<ReadonlyArray<RunEvent>, EventsError>
  readonly list: (input: ListInput) => Effect.Effect<ReadonlyArray<RunInspection>, RuntimeUnavailable>
  readonly respond: (input: RespondInput) => Effect.Effect<void, RespondError>
  readonly signal: (input: SignalInput) => Effect.Effect<void, SignalError>
  readonly cancel: (input: CancelInput) => Effect.Effect<void, CancelError>
  readonly steer: (input: SteerInput) => Effect.Effect<void, SteerError>
  readonly inspect: (runId: string) => Effect.Effect<RunInspection, InspectError>
}

export class Runtime extends Context.Service<Runtime, Interface>()("@batonfx/runtime/Runtime") {}
