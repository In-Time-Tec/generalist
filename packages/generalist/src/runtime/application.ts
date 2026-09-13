import type { Effect, Schema, Stream } from "effect"
import type { Prompt, Tool } from "effect/unstable/ai"
import type { Agent, Any as AnyAgent, Input } from "../core/agent/lifecycle/definition.js"
import type { DurabilityFailure } from "../durability/errors.js"
import type { ClientEvent } from "../server/projection/index.js"
import type { Address } from "./address.js"
import type { PayloadTooLarge, RunNotFound, RuntimeAvailabilityError, UnknownAgent } from "./errors.js"
import type * as Inspection from "./inspection.js"
import type { MessageReceipt } from "./messaging/mailbox.js"
import type { RunInspection } from "./run.js"
import type { SessionConflict, SessionError, SessionEventsError as StoredSessionEventsError } from "./session/host.js"
import type { SessionIdempotencyConflict, SessionQueueConflict } from "./session/queue.js"
import type {
  ActivateError,
  EventsError,
  EventsInput,
  HistoryInput,
  OperatorService as EngineOperatorService,
  RunHandle as EngineRunHandle,
  SendMessageError,
  Service as EngineService,
  StartError,
  StartOptions,
} from "./engine.js"

export type RuntimeReadError = RuntimeAvailabilityError | DurabilityFailure
export type RuntimeCommandError = import("./engine.js").SignalError | import("./engine.js").RespondError
export type HeldRunError = ActivateError
export type SessionReadError = SessionError | RuntimeAvailabilityError
export type SessionCreateError = RuntimeReadError | SessionConflict | PayloadTooLarge
export type SessionAdmissionError =
  | SessionReadError
  | SessionQueueConflict
  | UnknownAgent
  | SessionIdempotencyConflict
  | PayloadTooLarge
export type SessionControlError = SessionReadError | SessionQueueConflict
export type SessionEventsError = StoredSessionEventsError | RuntimeAvailabilityError

export type OperatorService = EngineOperatorService

export interface HoldOptions extends StartOptions {
  readonly idempotencyKey: string
}

export interface RunHandle<Value> extends Omit<EngineRunHandle<Value>, "await" | "events"> {
  readonly await: Effect.Effect<Value, Effect.Error<EngineRunHandle<Value>["await"]> | RuntimeAvailabilityError>
  readonly events: Stream.Stream<
    Stream.Success<EngineRunHandle<Value>["events"]>,
    Stream.Error<EngineRunHandle<Value>["events"]> | RuntimeAvailabilityError
  >
}

export interface HeldRunHandle<Value> extends RunHandle<Value> {
  readonly activate: (commandId: string) => Effect.Effect<RunInspection, ActivateError | RuntimeAvailabilityError>
}

export interface SessionSubmitOptions {
  readonly commandId: string
}

export interface SessionTaskReceipt {
  readonly sessionId: string
  readonly id: string
  readonly revision: number
}

export interface SessionQueueEntry {
  readonly id: string
  readonly revision: number
  readonly agent: string
  readonly prompt: Prompt.Prompt
}

export interface SessionHandle {
  readonly sessionId: string
  readonly inspect: Effect.Effect<Inspection.Session, SessionReadError>
  readonly queue: Effect.Effect<ReadonlyArray<SessionQueueEntry>, SessionReadError>
  readonly submit: <A extends AnyAgent>(
    agent: A,
    input: Input<A>,
    options: SessionSubmitOptions,
  ) => Effect.Effect<SessionTaskReceipt, SessionAdmissionError>
  readonly update: <A extends AnyAgent>(input: {
    readonly id: string
    readonly expectedRevision: number
    readonly commandId: string
    readonly agent: A
    readonly value: Input<A>
  }) => Effect.Effect<SessionTaskReceipt, SessionAdmissionError>
  readonly remove: (input: {
    readonly id: string
    readonly expectedRevision: number
    readonly commandId: string
  }) => Effect.Effect<void, SessionAdmissionError>
  readonly events: (cursor?: Inspection.Cursor) => Stream.Stream<ClientEvent, SessionEventsError>
  readonly control: (action: "stop" | "close" | "resume", commandId: string) => Effect.Effect<void, SessionControlError>
}

export interface SessionService {
  readonly create: (input: {
    readonly sessionId: string
    readonly title?: string
  }) => Effect.Effect<SessionHandle, SessionCreateError>
  readonly get: (sessionId: string) => Effect.Effect<SessionHandle, SessionReadError>
  readonly list: Effect.Effect<ReadonlyArray<Inspection.Session>, RuntimeReadError>
}

export interface MessagingService {
  readonly send: (input: {
    readonly fromRunId: string
    readonly to: Address
    readonly idempotencyKey: string
    readonly prompt: Prompt.Prompt | string
    readonly messageId?: string
    readonly causationId?: string
    readonly correlationId?: string
    readonly inReplyTo?: string
    readonly metadata?: Readonly<Record<string, Schema.Json>>
  }) => Effect.Effect<MessageReceipt, SendMessageError | RuntimeAvailabilityError>
}

export interface ChildSettlement {
  readonly sequence: number
  readonly parentRunId: string
  readonly childRunId: string
  readonly status: "succeeded" | "failed" | "cancelled"
}

export type ChildReadError = RuntimeReadError | RunNotFound | import("./child/admission.js").ChildParentageInvalid

export interface ChildObservationService {
  readonly list: (parentRunId: string) => Effect.Effect<ReadonlyArray<Inspection.Child>, ChildReadError>
  readonly inspect: (input: {
    readonly parentRunId: string
    readonly childRunId: string
  }) => Effect.Effect<Inspection.Child, ChildReadError>
  readonly settlements: (input: {
    readonly parentRunId: string
    readonly afterSequence?: number
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<ChildSettlement>, ChildReadError>
  readonly settlementChanges: (input: {
    readonly parentRunId: string
    readonly afterSequence?: number
  }) => Stream.Stream<ChildSettlement, ChildReadError>
}

export interface Service {
  readonly start: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options?: StartOptions,
  ) => Effect.Effect<RunHandle<OutputCodec["Type"]>, StartError | RuntimeAvailabilityError>
  readonly hold: <
    Tools extends Record<string, Tool.Any>,
    R,
    PolicyServices extends R,
    AuthorizationServices extends R,
    InputCodec extends Schema.Top,
    OutputCodec extends Schema.Top,
  >(
    agent: Agent<Tools, R, PolicyServices, AuthorizationServices, InputCodec, OutputCodec>,
    input: InputCodec["Type"],
    options: HoldOptions,
  ) => Effect.Effect<HeldRunHandle<OutputCodec["Type"]>, StartError | RuntimeAvailabilityError>
  readonly schedule: EngineService["schedule"]
  readonly inspect: (runId: string) => Effect.Effect<Inspection.Run, RunNotFound | RuntimeReadError>
  readonly list: (input: {
    readonly status?: Inspection.RunStatus
    readonly limit: number
  }) => Effect.Effect<ReadonlyArray<Inspection.Run>, RuntimeReadError>
  readonly events: (
    input: EventsInput,
  ) => Stream.Stream<import("./run/event.js").RunEvent, EventsError | RuntimeAvailabilityError>
  readonly history: (
    input: HistoryInput,
  ) => Effect.Effect<ReadonlyArray<import("./run/event.js").RunEvent>, EventsError | RuntimeAvailabilityError>
  readonly previews: (input: import("./engine.js").PreviewsInput) => Stream.Stream<import("./model-preview.js").Event>
  readonly signal: EngineService["signal"]
  readonly respond: EngineService["respond"]
  readonly cancel: (
    input: import("./engine.js").CancelInput,
  ) => Effect.Effect<void, import("./engine.js").CancelError | RuntimeAvailabilityError>
  readonly sessions: SessionService
  readonly children: ChildObservationService
  readonly messaging: MessagingService
  readonly operator: OperatorService
}
