import { Context, Effect, Schema, type Scope, type Stream } from "effect"
import { Prompt, type Response, type Tool, type Toolkit } from "effect/unstable/ai"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"

/** A modality negotiated independently for provider input and output. @experimental */
export const Modality = Schema.Literals(["text", "audio", "image"])
/** @experimental */
export type Modality = typeof Modality.Type

/** One modality and the media types a provider accepts or emits for it. @experimental */
export interface ModalityCapability {
  readonly modality: Modality
  /** Empty for text; exact media types for audio and image. */
  readonly mediaTypes: ReadonlyArray<string>
}

/** Provider-advertised or caller-required live capabilities. @experimental */
export interface Capabilities {
  readonly input: ReadonlyArray<ModalityCapability>
  readonly output: ReadonlyArray<ModalityCapability>
  readonly tools: boolean
  readonly interruption: boolean
}

/** Bounded buffering between a provider and the sole event consumer. @experimental */
export type Delivery =
  | { readonly _tag: "Backpressure"; readonly capacity: number }
  | { readonly _tag: "Fail"; readonly capacity: number }

/** Required capabilities and delivery behavior for one connection. @experimental */
export interface ConnectOptions {
  readonly capabilities: Capabilities
  readonly delivery: Delivery
}

/** Caller-owned identity for one semantic model assignment. @experimental */
export interface TurnAssignment {
  readonly turnId: string
  /** Opaque framework identity copied to every event for this turn. */
  readonly assignmentId?: string
}

/** Authoritative context and active tools for one explicitly requested semantic turn. @experimental */
export interface TurnRequest {
  readonly assignment: TurnAssignment
  /** Canonical history for this turn. Buffered current input is appended once and must not also appear here. */
  readonly context: Prompt.Prompt
  /** The complete active tool set for this turn; it replaces tools from any earlier turn. */
  readonly toolkit: Toolkit.Any
}

/** Effect AI input accepted by a live connection. File parts must contain bytes. @experimental */
export type InputPart = Prompt.TextPart | (Prompt.FilePart & { readonly data: Uint8Array })

/** Construct an Effect AI file input narrowed to provider-neutral bytes. @experimental */
export const inputFilePart = (options: {
  readonly mediaType: string
  readonly data: Uint8Array
  readonly fileName?: string
}): Prompt.FilePart & { readonly data: Uint8Array } => ({ ...Prompt.filePart(options), data: options.data })

/** Effect AI output emitted by a live connection. @experimental */
export type OutputPart = Response.TextPart | Response.TextDeltaPart | Response.FilePart

/** One complete Effect AI model response, suitable for the existing tool-batch boundary. @experimental */
export type TurnResponse = ReadonlyArray<Response.Part<Record<string, Tool.Any>>>

/** One ordered event from a live connection. @experimental */
export type Event =
  | { readonly _tag: "TurnStarted"; readonly sequence: number; readonly assignment: TurnAssignment }
  | {
      readonly _tag: "Output"
      readonly sequence: number
      readonly assignment: TurnAssignment
      /** Provisional observation only; `TurnCompleted.response` is the semantic result. */
      readonly provisional: true
      readonly part: OutputPart
    }
  | {
      readonly _tag: "ToolCall"
      readonly sequence: number
      readonly assignment: TurnAssignment
      readonly call: Response.ToolCallPart<string, unknown>
    }
  | {
      readonly _tag: "TurnCompleted"
      readonly sequence: number
      readonly assignment: TurnAssignment
      /** Complete semantic output. Providers do not execute tools or start a continuation turn. */
      readonly response: TurnResponse
    }
  | { readonly _tag: "TurnInterrupted"; readonly sequence: number; readonly assignment: TurnAssignment }
  | { readonly _tag: "Closed"; readonly sequence: number }

/** One requested modality, media type, or operation is unavailable. @experimental */
export class UnsupportedCapability extends ActionableTaggedError<UnsupportedCapability>()(
  "@generalist/live/UnsupportedCapability",
  {
    direction: Schema.Literals(["input", "output", "operation", "delivery"]),
    capability: Schema.String,
    mediaType: Schema.optional(Schema.String),
    hint: errorHint("Request only capabilities advertised by the selected Live provider."),
  },
) {}

/** A provider could not establish a live connection. @experimental */
export class ConnectionFailed extends ActionableTaggedError<ConnectionFailed>()("@generalist/live/ConnectionFailed", {
  reason: Schema.String,
  hint: errorHint("Inspect the provider connection failure and reconnect explicitly when safe."),
}) {}

/** An established live connection was lost. The outcome of an in-flight command may be unknown. @experimental */
export class ConnectionLost extends ActionableTaggedError<ConnectionLost>()("@generalist/live/ConnectionLost", {
  connectionId: Schema.String,
  reason: Schema.String,
  hint: errorHint("Treat in-flight command outcomes as unknown and reconnect explicitly when safe."),
}) {}

/** A fail-on-overflow event buffer reached its configured capacity. @experimental */
export class DeliveryOverflow extends ActionableTaggedError<DeliveryOverflow>()("@generalist/live/DeliveryOverflow", {
  connectionId: Schema.String,
  capacity: Schema.Int.check(Schema.isGreaterThan(0)),
  hint: errorHint("Drain events faster, increase capacity, or choose backpressure delivery."),
}) {}

/** A command was attempted after the connection stopped accepting input. @experimental */
export class ConnectionClosed extends ActionableTaggedError<ConnectionClosed>()("@generalist/live/ConnectionClosed", {
  connectionId: Schema.String,
  hint: errorHint("Acquire a new scoped Live connection before submitting another command."),
}) {}

/** A command conflicts with current turn or tool-call state. @experimental */
export class InvalidCommand extends ActionableTaggedError<InvalidCommand>()("@generalist/live/InvalidCommand", {
  connectionId: Schema.String,
  reason: Schema.String,
  hint: errorHint("Use the current turn and unresolved tool-call identities reported by ordered events."),
}) {}

/** A connection event stream was materialized more than once. @experimental */
export class EventsAlreadyConsumed extends ActionableTaggedError<EventsAlreadyConsumed>()(
  "@generalist/live/EventsAlreadyConsumed",
  {
    connectionId: Schema.String,
    hint: errorHint("Materialize each Live connection event stream exactly once."),
  },
) {}

/** Failures from commands submitted to an established connection. @experimental */
export type CommandFailure = UnsupportedCapability | ConnectionClosed | ConnectionLost | InvalidCommand

/** Failures observed while consuming ordered events. @experimental */
export type EventFailure = ConnectionLost | DeliveryOverflow | EventsAlreadyConsumed

/** One provider-neutral, scope-owned live connection. @experimental */
export interface Connection {
  readonly id: string
  readonly capabilities: Capabilities
  /** Single-consumer ordered events. Sequence starts at zero and remains contiguous. */
  readonly events: Stream.Stream<Event, EventFailure>
  /** Submit one input part. Success means local acceptance, not remote or durable acknowledgement. */
  readonly send: (part: InputPart) => Effect.Effect<void, CommandFailure>
  /** Request one response from authoritative context plus buffered current input. Only one turn may be active. */
  readonly commitInput: (request: TurnRequest) => Effect.Effect<void, CommandFailure>
  /** Submit one application-owned Effect AI tool result for an unresolved call. */
  readonly sendToolResult: (result: Prompt.ToolResultPart) => Effect.Effect<void, CommandFailure>
  /** Interrupt exactly the named active turn; this does not cancel a durable Run or application tool fiber. */
  readonly interrupt: (turnId: string) => Effect.Effect<void, CommandFailure>
  /** Idempotently stop local admission and release the connection. */
  readonly close: Effect.Effect<void>
}

/** Provider capability implemented by application or ecosystem Layers. @experimental */
export interface Service {
  readonly capabilities: Capabilities
  readonly connect: (
    options: ConnectOptions,
  ) => Effect.Effect<Connection, UnsupportedCapability | ConnectionFailed, Scope.Scope>
}

/** Scoped provider-neutral Live capability. @experimental */
// oxlint-disable-next-line effecttsgo/deterministic-keys -- Public service key is part of the Live contract.
export class LiveProvider extends Context.Service<LiveProvider, Service>()("generalist/live/LiveProvider") {}
