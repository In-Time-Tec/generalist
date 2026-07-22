import { Effect, Schema, SchemaTransformation } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent, ModelTelemetry, ToolExecutor, TurnPolicy } from "@batonfx/core"
import { WireEncodeFailed } from "./errors.js"

/** @experimental Canonical transport frame sequence and replay cursor schema. */
export const Sequence = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)

/** @experimental */
export type Sequence = typeof Sequence.Type

/** @experimental String representation of the canonical transport sequence. */
export const SequenceFromString = Schema.String.check(Schema.isPattern(/^\d+$/)).pipe(
  Schema.decodeTo(Sequence, SchemaTransformation.numberFromString),
)

const SnapshotSequence = Schema.Union([Schema.Literals([-1]), Sequence])

/** @experimental A run failure that is not an approval/tool-wait suspension. */
export const RunFailure = Schema.Union([
  AgentEvent.AgentError,
  AgentEvent.ResumeMismatch,
  TurnPolicy.TurnPolicyError,
  AgentEvent.TurnPolicyStopped,
  AgentEvent.TurnLimitExceeded,
  AgentEvent.MiddlewareViolation,
  ToolExecutor.FrameworkFailure,
])

/** @experimental */
export type RunFailure = typeof RunFailure.Type

/** @experimental Session lifecycle status carried over the wire. */
export const SessionStatus = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Idle") }),
  Schema.Struct({ _tag: Schema.tag("Running"), turn: Schema.Finite }),
  Schema.Struct({ _tag: Schema.tag("Suspended"), suspension: AgentEvent.AgentSuspended }),
  Schema.Struct({ _tag: Schema.tag("Failed"), error: RunFailure }),
])

/** @experimental */
export type SessionStatus = typeof SessionStatus.Type

/** @experimental Approval decision carried by a client frame. */
export const ClientApproval = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Approved") }),
  Schema.Struct({ _tag: Schema.tag("Denied"), reason: Schema.optionalKey(Schema.String) }),
])

/** @experimental */
export type ClientApproval = typeof ClientApproval.Type

/** @experimental Client to server control frame. */
export const ClientFrame = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Attach"), sessionId: Schema.String, afterSeq: Schema.optionalKey(Sequence) }),
  Schema.Struct({ _tag: Schema.tag("SendMessage"), sessionId: Schema.String, prompt: Schema.String }),
  Schema.Struct({
    _tag: Schema.tag("ResolveApproval"),
    sessionId: Schema.String,
    token: Schema.String,
    decision: ClientApproval,
  }),
  Schema.Struct({ _tag: Schema.tag("Cancel"), sessionId: Schema.String }),
])

/** @experimental */
export type ClientFrameType = typeof ClientFrame.Type

const Metadata = Schema.Record(Schema.String, Schema.Unknown)
const OptionalMetadata = Schema.optionalKey(Metadata)
const LooseToolCallPart = Schema.Struct({
  type: Schema.tag("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.optionalKey(Schema.Boolean),
  metadata: OptionalMetadata,
})
const LooseToolResultPart = Schema.Struct({
  type: Schema.tag("tool-result"),
  id: Schema.String,
  name: Schema.String,
  result: Schema.Unknown,
  encodedResult: Schema.optionalKey(Schema.Unknown),
  isFailure: Schema.Boolean,
  providerExecuted: Schema.optionalKey(Schema.Boolean),
  preliminary: Schema.optionalKey(Schema.Boolean),
  metadata: OptionalMetadata,
})

const unionOrNever = (schemas: ReadonlyArray<Schema.Top>): Schema.Top =>
  schemas.length === 0 ? Schema.Never : Schema.Union(schemas as [Schema.Top, ...Array<Schema.Top>])

const toolSchemas = (toolkit: Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>) =>
  Object.values(toolkit.tools) as ReadonlyArray<Tool.Any>

const toolCallSchema = (toolkit: Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>): Schema.Top =>
  unionOrNever(toolSchemas(toolkit).map((tool) => Response.ToolCallPart(tool.name, tool.parametersSchema)))

const toolResultBranch = (tool: Tool.Any, isFailure: boolean): Schema.Top =>
  Response.ToolResultPart(
    tool.name,
    isFailure ? Schema.Never : tool.successSchema,
    isFailure ? tool.failureSchema : Schema.Never,
  ).pipe(
    Schema.check(
      Schema.makeFilter(
        (part) => part.isFailure === isFailure || `Expected ${isFailure ? "failure" : "success"} tool result`,
      ),
    ),
  )

const toolResultSchema = (toolkit: Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>): Schema.Top =>
  unionOrNever(toolSchemas(toolkit).flatMap((tool) => [toolResultBranch(tool, false), toolResultBranch(tool, true)]))

const EventSchemaWith = <
  StreamPart extends Schema.Constraint,
  ResponsePart extends Schema.Constraint,
  ToolCall extends Schema.Constraint,
  ToolResult extends Schema.Constraint,
>(
  streamPart: StreamPart,
  responsePart: ResponsePart,
  toolCall: ToolCall,
  toolResult: ToolResult,
) =>
  Schema.Union([
    Schema.Struct({ _tag: Schema.tag("TurnStarted"), turn: Schema.Finite, metadata: OptionalMetadata }),
    Schema.Struct({
      _tag: Schema.tag("ModelPart"),
      turn: Schema.Finite,
      modelCallId: Schema.String,
      modelAttemptId: Schema.String,
      attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
      part: streamPart,
      metadata: OptionalMetadata,
    }),
    ModelTelemetry.Event,
    Schema.Struct({
      _tag: Schema.tag("ToolExecutionStarted"),
      turn: Schema.Finite,
      call: toolCall,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ToolProgress"),
      turn: Schema.Finite,
      toolCallId: Schema.String,
      message: Schema.optionalKey(Schema.String),
      data: Schema.optionalKey(Metadata),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ToolExecutionCompleted"),
      turn: Schema.Finite,
      call: toolCall,
      result: toolResult,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ApprovalRequested"),
      turn: Schema.Finite,
      call: toolCall,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("SteeringDrained"),
      turn: Schema.Finite,
      queue: Schema.Literals(["steering", "followUp"]),
      count: Schema.Finite,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("TurnCompleted"),
      turn: Schema.Finite,
      transcript: Schema.optionalKey(Prompt.Prompt),
      usage: Schema.optionalKey(Response.Usage),
      finishReason: Schema.optionalKey(Response.FinishReason),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("StructuredOutput"),
      turn: Schema.Finite,
      value: Schema.Unknown,
      content: Schema.Array(responsePart),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("Completed"),
      turns: Schema.Finite,
      text: Schema.String,
      transcript: Schema.optionalKey(Prompt.Prompt),
      usage: Schema.optionalKey(Response.Usage),
      metadata: OptionalMetadata,
    }),
  ])

/** @experimental Codec for one Baton loop event using the supplied toolkit. */
export const EventSchema = <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  EventSchemaWith(
    Response.StreamPart(toolkit),
    Response.Part(toolkit),
    toolCallSchema(toolkit),
    toolResultSchema(toolkit),
  ) as unknown as Schema.Codec<EventType, unknown, never, never>

/** @experimental Loose event codec for browser display of unknown tool names. */
export const LooseEventSchema = EventSchemaWith(
  Schema.Union([Response.StreamPart(Toolkit.empty), LooseToolCallPart, LooseToolResultPart]),
  Schema.Union([Response.Part(Toolkit.empty), LooseToolCallPart, LooseToolResultPart]),
  LooseToolCallPart,
  LooseToolResultPart,
)

/** @experimental Event type for runtime-dynamic tool names and payloads. */
export type LooseEventType = typeof LooseEventSchema.Type

/** @experimental Wire event type, allowing transcript stripping on terminal transcript events. */
export type EventType =
  | AgentEvent.TurnStarted
  | AgentEvent.ModelPart
  | ModelTelemetry.Event
  | AgentEvent.ToolExecutionStarted
  | AgentEvent.ToolProgress
  | AgentEvent.ToolExecutionCompleted
  | AgentEvent.ApprovalRequested
  | AgentEvent.SteeringDrained
  | (Omit<AgentEvent.TurnCompleted, "transcript"> & { readonly transcript?: Prompt.Prompt })
  | AgentEvent.StructuredOutput
  | (Omit<AgentEvent.Completed, "transcript"> & { readonly transcript?: Prompt.Prompt })

/** @experimental Server to client frame type. */
export type ServerFrameType =
  | { readonly _tag: "Event"; readonly seq: number; readonly event: EventType }
  | { readonly _tag: "Failed"; readonly seq: number; readonly error: RunFailure }
  | { readonly _tag: "Suspended"; readonly seq: number; readonly suspension: AgentEvent.AgentSuspended }
  | { readonly _tag: "Ended"; readonly seq: number }
  | { readonly _tag: "Snapshot"; readonly seq: number; readonly transcript: Prompt.Prompt }
  | { readonly _tag: "SessionStatus"; readonly seq: number; readonly status: SessionStatus }

const ServerFrameWith = <Event extends Schema.Constraint>(event: Event) =>
  Schema.Union([
    Schema.Struct({ _tag: Schema.tag("Event"), seq: Sequence, event }),
    Schema.Struct({ _tag: Schema.tag("Failed"), seq: Sequence, error: RunFailure }),
    Schema.Struct({ _tag: Schema.tag("Suspended"), seq: Sequence, suspension: AgentEvent.AgentSuspended }),
    Schema.Struct({ _tag: Schema.tag("Ended"), seq: Sequence }),
    Schema.Struct({ _tag: Schema.tag("Snapshot"), seq: SnapshotSequence, transcript: Prompt.Prompt }),
    Schema.Struct({ _tag: Schema.tag("SessionStatus"), seq: Sequence, status: SessionStatus }),
  ])

/** @experimental Server frame codec using the supplied toolkit. */
export const ServerFrame = <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  ServerFrameWith(EventSchema(toolkit)) as unknown as Schema.Codec<ServerFrameType, unknown, never, never>

/** @experimental Loose server frame codec for browser display of unknown tool names. */
export const LooseServerFrame = ServerFrameWith(LooseEventSchema)

/** @experimental */
export type LooseServerFrameType = typeof LooseServerFrame.Type

/** @experimental Fixed startup-toolkit or runtime-dynamic server-frame validation policy. */
export type Capability<
  T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>> =
    | Toolkit.Any
    | Toolkit.WithHandler<Record<string, Tool.Any>>,
> = { readonly capability: "fixed"; readonly toolkit: T } | { readonly capability: "runtime-dynamic" }

/** @experimental Lazy JSON encoders for transport client and server frames. */
export interface WireCodec<in Frame = ServerFrameType> {
  readonly encodeServer: (frame: Frame) => Effect.Effect<string, WireEncodeFailed>
  readonly encodeClient: (frame: ClientFrameType) => Effect.Effect<string, WireEncodeFailed>
}

const encodeError = (error: Schema.SchemaError): WireEncodeFailed => WireEncodeFailed.make({ message: String(error) })

const makeCodec = <Frame>(serverFrame: Schema.Codec<unknown, unknown, never, never>): WireCodec<Frame> => ({
  encodeServer: (frame) =>
    Schema.encodeUnknownEffect(Schema.fromJsonString(serverFrame))(frame).pipe(Effect.mapError(encodeError)),
  encodeClient: (frame) =>
    Schema.encodeEffect(Schema.fromJsonString(ClientFrame))(frame).pipe(Effect.mapError(encodeError)),
})

/** @experimental Builds a fixed JSON wire codec using the supplied toolkit. */
export function codec<T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(
  toolkit: T,
): WireCodec<ServerFrameType | LooseServerFrameType>
/** @experimental Builds a fixed JSON wire codec using an explicit capability. */
export function codec<T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(capability: {
  readonly capability: "fixed"
  readonly toolkit: T
}): WireCodec<ServerFrameType | LooseServerFrameType>
/** @experimental Builds a runtime-dynamic JSON wire codec with unknown tool payloads. */
export function codec(capability: { readonly capability: "runtime-dynamic" }): WireCodec<LooseServerFrameType>
/** @experimental Builds a JSON wire codec from a capability selected by the caller. */
export function codec<T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(
  capability: Capability<T>,
): WireCodec<ServerFrameType | LooseServerFrameType>
export function codec<T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(
  input: T | Capability<T>,
): WireCodec<ServerFrameType | LooseServerFrameType> {
  if ("tools" in input) {
    return makeCodec<ServerFrameType | LooseServerFrameType>(ServerFrame(input))
  }
  return input.capability === "runtime-dynamic"
    ? makeCodec<LooseServerFrameType>(LooseServerFrame)
    : makeCodec<ServerFrameType | LooseServerFrameType>(ServerFrame(input.toolkit))
}
