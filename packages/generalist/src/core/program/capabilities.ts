import { Context, Effect, Schema } from "effect"

const programKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/), Schema.isMinLength(1), Schema.isMaxLength(64)),
)

/** Stable, bounded, source-owned identity for one effectful operation. */
export const ProgramOperationName = programKey
export type ProgramOperationName = typeof ProgramOperationName.Type

/** Stable, bounded identity for one member of a map or fan-out. */
export const ProgramMemberKey = programKey
export type ProgramMemberKey = typeof ProgramMemberKey.Type
export const LogLevel = Schema.Literals(["debug", "info", "warn", "error"])
export type LogLevel = typeof LogLevel.Type
export class ProgramCapabilityMissing extends Schema.TaggedError<ProgramCapabilityMissing>()(
  "generalist/core/ProgramCapabilityMissing",
  { capability: Schema.String },
) {}
export class ProgramCapabilityDenied extends Schema.TaggedError<ProgramCapabilityDenied>()(
  "generalist/core/ProgramCapabilityDenied",
  { capability: Schema.String, operation: ProgramOperationName, reason: Schema.String },
) {}
export class ProgramAuthorizationFailure extends Schema.TaggedError<ProgramAuthorizationFailure>()(
  "generalist/core/ProgramAuthorizationFailure",
  { capability: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}
export class ProgramSchemaFailure extends Schema.TaggedError<ProgramSchemaFailure>()(
  "generalist/core/ProgramSchemaFailure",
  {
    boundary: Schema.Literals([
      "program-input",
      "program-output",
      "tool-input",
      "tool-output",
      "step-input",
      "step-output",
      "agent-input",
      "agent-output",
    ]),
    capability: Schema.optionalKey(Schema.String),
    message: Schema.String,
  },
) {}
export class ProgramToolFailure extends Schema.TaggedError<ProgramToolFailure>()("generalist/core/ProgramToolFailure", {
  tool: Schema.String,
  operation: ProgramOperationName,
  cause: Schema.Unknown,
}) {}
export class ProgramStepFailure extends Schema.TaggedError<ProgramStepFailure>()("generalist/core/ProgramStepFailure", {
  step: Schema.String,
  operation: ProgramOperationName,
  cause: Schema.Unknown,
}) {}
export class ProgramAgentFailure extends Schema.TaggedError<ProgramAgentFailure>()(
  "generalist/core/ProgramAgentFailure",
  { selection: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}
export class ProgramBudgetExhausted extends Schema.TaggedError<ProgramBudgetExhausted>()(
  "generalist/core/ProgramBudgetExhausted",
  {
    dimension: Schema.Literals([
      "agentRuns",
      "concurrency",
      "toolCalls",
      "tokens",
      "wallClockMillis",
      "logBytes",
      "outputBytes",
    ]),
    limit: Schema.Finite,
  },
) {}
export class ProgramReplayDivergence extends Schema.TaggedError<ProgramReplayDivergence>()(
  "generalist/core/ProgramReplayDivergence",
  { operation: ProgramOperationName, expected: Schema.String, actual: Schema.String },
) {}
export class ProgramOperationUnknown extends Schema.TaggedError<ProgramOperationUnknown>()(
  "generalist/core/ProgramOperationUnknown",
  { operation: ProgramOperationName },
) {}

/** One decoded invocation failed with an implementation-specific error. */
export class ProgramInvocationFailure extends Schema.TaggedError<ProgramInvocationFailure>()(
  "generalist/core/ProgramInvocationFailure",
  { cause: Schema.Unknown },
) {}
export class ProgramSuspended extends Schema.TaggedError<ProgramSuspended>()("generalist/core/ProgramSuspended", {
  operation: ProgramOperationName,
  reason: Schema.Literals(["approval", "tool-wait", "agent", "step"]),
  token: Schema.optionalKey(Schema.String),
}) {}
export class ProgramCancelled extends Schema.TaggedError<ProgramCancelled>()("generalist/core/ProgramCancelled", {
  reason: Schema.String,
}) {}
export interface ToolCallInput {
  readonly operation: ProgramOperationName
  readonly tool: string
  readonly input: unknown
}
export interface StepCallInput {
  readonly operation: ProgramOperationName
  readonly step: string
  readonly input: unknown
}
export interface AgentRunInput {
  readonly operation: ProgramOperationName
  readonly selection: string
  readonly input: unknown
}

/** Token accounting reported by the host-owned Agent executor. */
interface AgentTokenUsage {
  readonly input: number
  readonly output: number
}
export interface AgentRunResult {
  readonly text: string
  readonly turns: number
  readonly tokenUsage: AgentTokenUsage
}
interface AgentMapMember {
  readonly member: ProgramMemberKey
  readonly input: unknown
}
export interface AgentMapInput {
  readonly operation: ProgramOperationName
  readonly selection: string
  readonly members: ReadonlyArray<AgentMapMember>
}
interface AgentFanOutMember extends AgentMapMember {
  readonly selection: string
}
export interface AgentFanOutInput {
  readonly operation: ProgramOperationName
  readonly members: ReadonlyArray<AgentFanOutMember>
}
export interface AgentMemberResult {
  readonly member: ProgramMemberKey
  readonly result: AgentRunResult
}
export interface LogInput {
  readonly operation: ProgramOperationName
  readonly level: LogLevel
  readonly message: string
  readonly data?: Schema.JsonObject
}

/** One manifest-scoped tool visible to Program source. */
export interface ToolSummary {
  readonly name: string
}

/** Focused encoded type description for one manifest-scoped tool. */
export interface ToolDescription extends ToolSummary {
  readonly inputSchema: Schema.Json
  readonly outputSchema: Schema.Json
}

/** Failures crossing the encoded program capability protocol. */
export const CapabilityFailure = Schema.Union([
  ProgramCapabilityMissing,
  ProgramCapabilityDenied,
  ProgramAuthorizationFailure,
  ProgramSchemaFailure,
  ProgramToolFailure,
  ProgramStepFailure,
  ProgramAgentFailure,
  ProgramBudgetExhausted,
  ProgramReplayDivergence,
  ProgramOperationUnknown,
  ProgramSuspended,
  ProgramCancelled,
])
export type CapabilityFailure = typeof CapabilityFailure.Type

/** Encoded operations visible to sandboxed source. */
export interface Service {
  readonly discoverTools: Effect.Effect<ReadonlyArray<ToolSummary>>
  readonly describeTool: (name: string) => Effect.Effect<ToolDescription, ProgramCapabilityMissing>
  readonly callTool: (input: ToolCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly callStep: (input: StepCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly runAgent: (input: AgentRunInput) => Effect.Effect<AgentRunResult, CapabilityFailure>
  readonly mapAgents: (input: AgentMapInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly fanOutAgents: (input: AgentFanOutInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly log: (input: LogInput) => Effect.Effect<void, CapabilityFailure>
}

/** Host-owned encoded operations exposed only inside a sandbox execution. */
export class ProgramCapabilities extends Context.Service<ProgramCapabilities, Service>()(
  "generalist/core/program/capabilities/ProgramCapabilities",
) {}
