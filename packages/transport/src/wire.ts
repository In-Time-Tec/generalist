import { Schema } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { AgentEvent } from "@batonfx/core"

/** @experimental A run failure that is not an approval/tool-wait suspension. */
export const RunFailure = Schema.Union([
  AgentEvent.AgentError,
  AgentEvent.TurnLimitExceeded,
  AgentEvent.MiddlewareViolation,
])

/** @experimental */
export type RunFailure = typeof RunFailure.Type

/** @experimental Session lifecycle status carried over the wire. */
export const SessionStatus = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Idle") }),
  Schema.Struct({ _tag: Schema.tag("Running"), turn: Schema.Number }),
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
  Schema.Struct({ _tag: Schema.tag("Attach"), sessionId: Schema.String, afterSeq: Schema.optionalKey(Schema.Number) }),
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

const toolResultSchema = (toolkit: Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>): Schema.Top =>
  unionOrNever(
    toolSchemas(toolkit).map((tool) => Response.ToolResultPart(tool.name, tool.successSchema, tool.failureSchema)),
  )

const EventSchemaWith = (
  streamPart: Schema.Top,
  responsePart: Schema.Top,
  toolCall: Schema.Top,
  toolResult: Schema.Top,
) =>
  Schema.Union([
    Schema.Struct({ _tag: Schema.tag("TurnStarted"), turn: Schema.Number, metadata: OptionalMetadata }),
    Schema.Struct({ _tag: Schema.tag("ModelPart"), turn: Schema.Number, part: streamPart, metadata: OptionalMetadata }),
    Schema.Struct({
      _tag: Schema.tag("ToolExecutionStarted"),
      turn: Schema.Number,
      call: toolCall,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ToolProgress"),
      turn: Schema.Number,
      toolCallId: Schema.String,
      message: Schema.optionalKey(Schema.String),
      data: Schema.optionalKey(Metadata),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ToolExecutionCompleted"),
      turn: Schema.Number,
      call: toolCall,
      result: toolResult,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("ApprovalRequested"),
      turn: Schema.Number,
      call: toolCall,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("SteeringDrained"),
      turn: Schema.Number,
      queue: Schema.Literals(["steering", "followUp"]),
      count: Schema.Number,
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("TurnCompleted"),
      turn: Schema.Number,
      transcript: Schema.optionalKey(Prompt.Prompt),
      usage: Schema.optionalKey(Response.Usage),
      finishReason: Schema.optionalKey(Response.FinishReason),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("StructuredOutput"),
      turn: Schema.Number,
      value: Schema.Unknown,
      content: Schema.Array(responsePart),
      metadata: OptionalMetadata,
    }),
    Schema.Struct({
      _tag: Schema.tag("Completed"),
      turns: Schema.Number,
      text: Schema.String,
      transcript: Schema.optionalKey(Prompt.Prompt),
      usage: Schema.optionalKey(Response.Usage),
      metadata: OptionalMetadata,
    }),
  ]) as unknown as Schema.Codec<EventType, unknown, never, never>

/** @experimental Codec for one Baton loop event using the supplied toolkit. */
export const EventSchema = <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  EventSchemaWith(
    Response.StreamPart(toolkit),
    Response.Part(toolkit),
    toolCallSchema(toolkit),
    toolResultSchema(toolkit),
  )

/** @experimental Loose event codec for browser display of unknown tool names. */
export const LooseEventSchema = EventSchemaWith(
  Schema.Union([Response.StreamPart(Toolkit.empty), LooseToolCallPart, LooseToolResultPart]),
  Schema.Union([Response.Part(Toolkit.empty), LooseToolCallPart, LooseToolResultPart]),
  LooseToolCallPart,
  LooseToolResultPart,
)

/** @experimental Wire event type, allowing transcript stripping on terminal transcript events. */
export type EventType =
  | AgentEvent.TurnStarted
  | AgentEvent.ModelPart
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

const ServerFrameWith = (event: Schema.Top) =>
  Schema.Union([
    Schema.Struct({ _tag: Schema.tag("Event"), seq: Schema.Number, event }),
    Schema.Struct({ _tag: Schema.tag("Failed"), seq: Schema.Number, error: RunFailure }),
    Schema.Struct({ _tag: Schema.tag("Suspended"), seq: Schema.Number, suspension: AgentEvent.AgentSuspended }),
    Schema.Struct({ _tag: Schema.tag("Ended"), seq: Schema.Number }),
    Schema.Struct({ _tag: Schema.tag("Snapshot"), seq: Schema.Number, transcript: Prompt.Prompt }),
    Schema.Struct({ _tag: Schema.tag("SessionStatus"), seq: Schema.Number, status: SessionStatus }),
  ]) as unknown as Schema.Codec<ServerFrameType, unknown, never, never>

/** @experimental Server frame codec using the supplied toolkit. */
export const ServerFrame = <T extends Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>>(toolkit: T) =>
  ServerFrameWith(EventSchema(toolkit))

/** @experimental Loose server frame codec for browser display of unknown tool names. */
export const LooseServerFrame = ServerFrameWith(LooseEventSchema)

/** @experimental */
export type LooseServerFrameType = ServerFrameType
