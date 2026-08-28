import { Cause, Effect, Function, Schema } from "effect"
import { Pins, ProgramCapabilities } from "../../core/index.js"

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

export type SerializedValue = typeof Schema.Unknown.Type

type SchemaFailureMapper = (error: Schema.SchemaError) => InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>

const isBoundary = (value: SerializedValue): value is ProgramBoundary =>
  value === "program-output" ||
  value === "tool-input" ||
  value === "tool-output" ||
  value === "step-input" ||
  value === "step-output" ||
  value === "agent-input" ||
  value === "agent-output"

export const schemaFailure: {
  (boundary: ProgramBoundary, capability?: string): SchemaFailureMapper
  (capability?: string): (boundary: ProgramBoundary) => SchemaFailureMapper
} = Function.dual(
  (args) => args.length >= 2 || isBoundary(args[0]),
  (boundary: ProgramBoundary, capability?: string): SchemaFailureMapper =>
    (error) =>
      ProgramCapabilities.ProgramSchemaFailure.make(
        capability === undefined
          ? {
              boundary,
              message: String(error),
            }
          : { boundary, capability, message: String(error) },
      ),
)

type StrictDecodeResult<S extends Schema.Constraint> = (
  value: SerializedValue,
) => Effect.Effect<S["Type"], InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>, S["DecodingServices"]>

export const strictDecode: {
  <S extends Schema.Constraint>(schema: S, boundary: ProgramBoundary, capability?: string): StrictDecodeResult<S>
  <S extends Schema.Constraint>(boundary: ProgramBoundary, capability?: string): (schema: S) => StrictDecodeResult<S>
} = Function.dual(
  (args) => args.length >= 3 || (args.length === 2 && isBoundary(args[1])),
  <S extends Schema.Constraint>(schema: S, boundary: ProgramBoundary, capability?: string): StrictDecodeResult<S> =>
    (value: SerializedValue) =>
      Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(value).pipe(
        Effect.mapError(schemaFailure(boundary, capability)),
      ),
)

export const encodedBytes = (
  value: SerializedValue,
): Effect.Effect<number, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>> =>
  Schema.decodeUnknownEffect(Schema.Json, { onExcessProperty: "error" })(value).pipe(
    Effect.mapError(schemaFailure("program-output", "program")),
    Effect.map((json) => new TextEncoder().encode(JSON.stringify(json)).byteLength),
  )
export const digest: {
  (
    boundary: "tool-input" | "step-input" | "agent-input" | "program-output",
    capability?: string,
  ): (value: SerializedValue) => Effect.Effect<string, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>>
  (
    value: SerializedValue,
    boundary: "tool-input" | "step-input" | "agent-input" | "program-output",
    capability?: string,
  ): Effect.Effect<string, InstanceType<typeof ProgramCapabilities.ProgramSchemaFailure>>
} = Function.dual(
  (args) => args.length >= 3 || (args.length === 2 && isBoundary(args[1])),
  (
    value: SerializedValue,
    boundary: "tool-input" | "step-input" | "agent-input" | "program-output",
    capability?: string,
  ) =>
    Effect.try({
      try: () => Pins.digest(value),
      catch: (error) =>
        ProgramCapabilities.ProgramSchemaFailure.make(
          capability === undefined
            ? {
                boundary,
                message: String(error),
              }
            : { boundary, capability, message: String(error) },
        ),
    }),
)
export const storeFailure = (error: SerializedValue): ProgramCapabilities.CapabilityFailure =>
  Schema.is(ProgramCapabilities.CapabilityFailure)(error)
    ? error
    : ProgramCapabilities.ProgramCancelled.make({ reason: `Program store failure: ${String(error)}` })

export const failureFromExit = (
  cause: Cause.Cause<ProgramCapabilities.CapabilityFailure>,
): ProgramCapabilities.CapabilityFailure =>
  Cause.findErrorOption(cause).pipe((failure) =>
    failure._tag === "Some"
      ? failure.value
      : ProgramCapabilities.ProgramCancelled.make({ reason: Cause.pretty(cause) }),
  )
