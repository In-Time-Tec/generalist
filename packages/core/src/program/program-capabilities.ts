import { Context, Effect, Schema } from "effect"

const programKey = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/), Schema.isMinLength(1), Schema.isMaxLength(64)),
)

/** @experimental Stable, bounded, source-owned identity for one effectful operation. */
export const ProgramOperationName = programKey
/** @experimental */
export type ProgramOperationName = typeof ProgramOperationName.Type

/** @experimental Stable, bounded identity for one member of a map or fan-out. */
export const ProgramMemberKey = programKey
/** @experimental */
export type ProgramMemberKey = typeof ProgramMemberKey.Type

/** @experimental */
export const LogLevel = Schema.Literals(["debug", "info", "warn", "error"])
/** @experimental */
export type LogLevel = typeof LogLevel.Type

/** @experimental */
export class ProgramCapabilityMissing extends Schema.TaggedErrorClass<ProgramCapabilityMissing>()(
  "@batonfx/core/ProgramCapabilityMissing",
  { capability: Schema.String },
) {}

/** @experimental */
export class ProgramCapabilityDenied extends Schema.TaggedErrorClass<ProgramCapabilityDenied>()(
  "@batonfx/core/ProgramCapabilityDenied",
  { capability: Schema.String, operation: ProgramOperationName, reason: Schema.String },
) {}

/** @experimental */
export class ProgramAuthorizationFailure extends Schema.TaggedErrorClass<ProgramAuthorizationFailure>()(
  "@batonfx/core/ProgramAuthorizationFailure",
  { capability: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}

/** @experimental */
export class ProgramSchemaFailure extends Schema.TaggedErrorClass<ProgramSchemaFailure>()(
  "@batonfx/core/ProgramSchemaFailure",
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

/** @experimental */
export class ProgramToolFailure extends Schema.TaggedErrorClass<ProgramToolFailure>()(
  "@batonfx/core/ProgramToolFailure",
  { tool: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}

/** @experimental */
export class ProgramStepFailure extends Schema.TaggedErrorClass<ProgramStepFailure>()(
  "@batonfx/core/ProgramStepFailure",
  { step: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}

/** @experimental */
export class ProgramAgentFailure extends Schema.TaggedErrorClass<ProgramAgentFailure>()(
  "@batonfx/core/ProgramAgentFailure",
  { selection: Schema.String, operation: ProgramOperationName, cause: Schema.Unknown },
) {}

/** @experimental */
export class ProgramBudgetExhausted extends Schema.TaggedErrorClass<ProgramBudgetExhausted>()(
  "@batonfx/core/ProgramBudgetExhausted",
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

/** @experimental */
export class ProgramReplayDivergence extends Schema.TaggedErrorClass<ProgramReplayDivergence>()(
  "@batonfx/core/ProgramReplayDivergence",
  { operation: ProgramOperationName, expected: Schema.String, actual: Schema.String },
) {}

/** @experimental */
export class ProgramOperationUnknown extends Schema.TaggedErrorClass<ProgramOperationUnknown>()(
  "@batonfx/core/ProgramOperationUnknown",
  { operation: ProgramOperationName },
) {}

/** @experimental One decoded invocation failed with an implementation-specific error. */
export class ProgramInvocationFailure extends Schema.TaggedErrorClass<ProgramInvocationFailure>()(
  "@batonfx/core/ProgramInvocationFailure",
  { cause: Schema.Unknown },
) {}

/** @experimental */
export class ProgramSuspended extends Schema.TaggedErrorClass<ProgramSuspended>()("@batonfx/core/ProgramSuspended", {
  operation: ProgramOperationName,
  reason: Schema.Literals(["approval", "tool-wait", "agent", "step"]),
  token: Schema.optionalKey(Schema.String),
}) {}

/** @experimental */
export class ProgramCancelled extends Schema.TaggedErrorClass<ProgramCancelled>()("@batonfx/core/ProgramCancelled", {
  reason: Schema.String,
}) {}

/** @experimental */
export interface ToolCallInput {
  readonly operation: ProgramOperationName
  readonly tool: string
  readonly input: unknown
}

/** @experimental */
export interface StepCallInput {
  readonly operation: ProgramOperationName
  readonly step: string
  readonly input: unknown
}

/** @experimental */
export interface AgentRunInput {
  readonly operation: ProgramOperationName
  readonly selection: string
  readonly input: unknown
}

/** @experimental Token accounting reported by the host-owned Agent executor. */
export interface AgentTokenUsage {
  readonly input: number
  readonly output: number
}

/** @experimental */
export interface AgentRunResult {
  readonly text: string
  readonly turns: number
  readonly tokenUsage: AgentTokenUsage
}

/** @experimental */
export interface AgentMapMember {
  readonly member: ProgramMemberKey
  readonly input: unknown
}

/** @experimental */
export interface AgentMapInput {
  readonly operation: ProgramOperationName
  readonly selection: string
  readonly members: ReadonlyArray<AgentMapMember>
}

/** @experimental */
export interface AgentFanOutMember extends AgentMapMember {
  readonly selection: string
}

/** @experimental */
export interface AgentFanOutInput {
  readonly operation: ProgramOperationName
  readonly members: ReadonlyArray<AgentFanOutMember>
}

/** @experimental */
export interface AgentMemberResult {
  readonly member: ProgramMemberKey
  readonly result: AgentRunResult
}

/** @experimental */
export interface LogInput {
  readonly operation: ProgramOperationName
  readonly level: LogLevel
  readonly message: string
  readonly data?: Readonly<Record<string, unknown>>
}

/** @experimental One manifest-scoped tool visible to Program source. */
export interface ToolSummary {
  readonly name: string
}

/** @experimental Focused encoded type description for one manifest-scoped tool. */
export interface ToolDescription extends ToolSummary {
  readonly inputSchema: Schema.Json
  readonly outputSchema: Schema.Json
}

/** @experimental Failures crossing the encoded program capability protocol. */
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
/** @experimental */
export type CapabilityFailure = typeof CapabilityFailure.Type

/** @experimental Encoded operations visible to sandboxed source. */
export interface Interface {
  readonly discoverTools: Effect.Effect<ReadonlyArray<ToolSummary>>
  readonly describeTool: (name: string) => Effect.Effect<ToolDescription, ProgramCapabilityMissing>
  readonly callTool: (input: ToolCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly callStep: (input: StepCallInput) => Effect.Effect<unknown, CapabilityFailure>
  readonly runAgent: (input: AgentRunInput) => Effect.Effect<AgentRunResult, CapabilityFailure>
  readonly mapAgents: (input: AgentMapInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly fanOutAgents: (input: AgentFanOutInput) => Effect.Effect<ReadonlyArray<AgentMemberResult>, CapabilityFailure>
  readonly log: (input: LogInput) => Effect.Effect<void, CapabilityFailure>
}

/** @experimental Host-owned encoded operations exposed only inside a sandbox execution. */
export class ProgramCapabilities extends Context.Service<ProgramCapabilities, Interface>()(
  "@batonfx/core/program/program-capabilities/ProgramCapabilities",
) {}
