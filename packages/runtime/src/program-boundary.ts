import { Effect, Schema } from "effect"
import { Pins, ProgramCapabilities } from "@batonfx/core"

const Operation = ProgramCapabilities.ProgramOperationName
const Member = ProgramCapabilities.ProgramMemberKey
export const ToolCall = Schema.Struct({ operation: Operation, tool: Schema.String, input: Schema.Json })
export const StepCall = Schema.Struct({ operation: Operation, step: Schema.String, input: Schema.Json })
export const AgentRun = Schema.Struct({ operation: Operation, selection: Schema.String, input: Schema.Json })
const MemberInput = Schema.Struct({ member: Member, input: Schema.Json })
export const AgentMap = Schema.Struct({
  operation: Operation,
  selection: Schema.String,
  members: Schema.Array(MemberInput),
})
const AgentFanOutMember = Schema.Struct({ member: Member, selection: Schema.String, input: Schema.Json })
export const AgentFanOut = Schema.Struct({ operation: Operation, members: Schema.Array(AgentFanOutMember) })
export const Log = Schema.Struct({
  operation: Operation,
  level: ProgramCapabilities.LogLevel,
  message: Schema.String,
  data: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
})
const TokenUsage = Schema.Struct({
  input: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  output: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
const AgentResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  tokenUsage: TokenUsage,
})
export const AgentMemberResults = Schema.Array(Schema.Struct({ member: Member, result: AgentResult }))

export type ProgramBoundary =
  | "program-output"
  | "tool-input"
  | "tool-output"
  | "step-input"
  | "step-output"
  | "agent-input"
  | "agent-output"

export const schemaFailure =
  (
    boundary: ProgramBoundary,
    capability?: string,
  ): ((error: Schema.SchemaError) => InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>) =>
  (error) =>
    ProgramCapabilities.ProgramSchemaFailure.make({
      boundary,
      ...(capability === undefined ? {} : { capability }),
      message: String(error),
    })

export const strictDecode =
  <S extends Schema.Constraint>(schema: S, boundary: ProgramBoundary, capability?: string) =>
  (
    value: unknown,
  ): Effect.Effect<S["Type"], InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>, S["DecodingServices"]> =>
    Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(value).pipe(
      Effect.mapError(schemaFailure(boundary, capability)),
    )

export const encodedBytes = (
  value: unknown,
): Effect.Effect<number, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>> =>
  Schema.decodeUnknownEffect(Schema.Json, { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(schemaFailure("program-output", "program")),
    Effect.map((json) => new TextEncoder().encode(JSON.stringify(json)).byteLength),
  )
export const digest = (
  value: unknown,
  boundary: "tool-input" | "step-input" | "agent-input" | "program-output",
  capability?: string,
): Effect.Effect<string, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>> =>
  Effect.try({
    try: () => Pins.digest(value),
    catch: (error) =>
      ProgramCapabilities.ProgramSchemaFailure.make({
        boundary,
        ...(capability === undefined ? {} : { capability }),
        message: String(error),
      }),
  })
export const storeFailure = (error: unknown): ProgramCapabilities.CapabilityFailure =>
  Schema.is(ProgramCapabilities.CapabilityFailure)(error)
    ? error
    : ProgramCapabilities.ProgramCancelled.make({ reason: `Program store failure: ${String(error)}` })

export const failureFromExit = (cause: {
  readonly reasons: ReadonlyArray<unknown>
}): ProgramCapabilities.CapabilityFailure => {
  const reason = cause.reasons.length === 1 ? cause.reasons[0] : undefined
  return typeof reason === "object" &&
    reason !== null &&
    "_tag" in reason &&
    reason._tag === "Fail" &&
    "error" in reason
    ? (reason.error as ProgramCapabilities.CapabilityFailure)
    : ProgramCapabilities.ProgramCancelled.make({ reason: String(cause) })
}
