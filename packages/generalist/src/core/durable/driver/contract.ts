import { Effect, Function, Schema } from "effect"
import type { ParseOptions } from "effect/SchemaAST"
import { ExecutableRef } from "../manifest/executable-manifest.js"
import { RunBudget } from "../run-budget.js"
import { digest as canonicalDigest } from "../canonical-json.js"

const ParseOptionsInput = Schema.Struct({
  errors: Schema.optionalKey(Schema.Literals(["first", "all"])),
  onExcessProperty: Schema.optionalKey(Schema.Literals(["ignore", "error", "preserve"])),
  propertyOrder: Schema.optionalKey(Schema.Literals(["none", "original"])),
  disableChecks: Schema.optionalKey(Schema.Boolean),
  concurrency: Schema.optionalKey(Schema.Union([Schema.Finite, Schema.Literal("unbounded")])),
})
const isParseOptions = Schema.is(ParseOptionsInput)

/** Version string for a durable driver implementation. */
export const DriverVersion = Schema.String
export type DriverVersion = typeof DriverVersion.Type

/** Current durable driver contract version. */
export const currentDriverVersion = "1" as const

/** How a host may replay one persisted operation after recovery. */
export const ReplayPolicy = Schema.Literals(["pure", "provider-idempotent", "never"])
export type ReplayPolicy = typeof ReplayPolicy.Type

/** Bounded operation kinds the driver may schedule. */
export const DriverOperationKind = Schema.Literals([
  "model",
  "tool",
  "memory",
  "compaction",
  "handoff",
  "send",
  "wait",
  "structured-output",
])
export type DriverOperationKind = typeof DriverOperationKind.Type

/** One schedulable nondeterministic operation with deterministic identity. */
export const DriverOperation = Schema.Struct({
  key: Schema.String,
  kind: DriverOperationKind,
  input: Schema.Unknown,
  inputDigest: Schema.String,
  replayPolicy: ReplayPolicy,
})
export type DriverOperation = typeof DriverOperation.Type

/** Persisted outcome for one operation attempt. */
export const OperationOutcome = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Succeeded"), value: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Failed"), error: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Unknown"), operationId: Schema.String }),
])
export type OperationOutcome = typeof OperationOutcome.Type

/** Wait the driver requests before the next decision. */
export const WaitDefinition = Schema.Struct({
  waitId: Schema.String,
  reason: Schema.String,
  replayToken: Schema.optionalKey(Schema.String),
})
export type WaitDefinition = typeof WaitDefinition.Type

/** Reconstructable durable checkpoint for one agent run. */
export const DriverCheckpoint = Schema.Struct({
  driverVersion: DriverVersion,
  executable: Schema.optionalKey(ExecutableRef),
  turn: Schema.Finite.pipe(Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))),
  budget: RunBudget,
  state: Schema.Unknown,
})
export type DriverCheckpoint = typeof DriverCheckpoint.Type

/** Terminal structured result carried by a Complete decision. */
export const DriverResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Finite,
})
export type DriverResult = typeof DriverResult.Type

/** Next step chosen deterministically from one checkpoint. */
export const DriverDecision = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Execute"), operation: DriverOperation }),
  Schema.Struct({ _tag: Schema.tag("Wait"), wait: WaitDefinition }),
  Schema.Struct({ _tag: Schema.tag("Continue"), checkpoint: DriverCheckpoint }),
  Schema.Struct({ _tag: Schema.tag("Complete"), result: DriverResult }),
])
export type DriverDecision = typeof DriverDecision.Type
export const operationKey = (parts: ReadonlyArray<string | number>): string => parts.map(String).join(":")
export const inputDigest = (input: Parameters<typeof canonicalDigest>[0]): string => canonicalDigest(input)
export const make = (input: {
  readonly key: string
  readonly kind: DriverOperationKind
  readonly input: unknown
  readonly replayPolicy: ReplayPolicy
}): DriverOperation => ({
  key: input.key,
  kind: input.kind,
  input: input.input,
  inputDigest: inputDigest(input.input),
  replayPolicy: input.replayPolicy,
})
export const encodeCheckpoint: {
  (
    input: DriverCheckpoint,
    options?: ParseOptions,
  ): Effect.Effect<typeof DriverCheckpoint.Encoded, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: DriverCheckpoint) => Effect.Effect<typeof DriverCheckpoint.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: DriverCheckpoint,
    options?: ParseOptions,
  ): Effect.Effect<typeof DriverCheckpoint.Encoded, Schema.SchemaError, never> =>
    Schema.encodeEffect(DriverCheckpoint)(input, options),
)
export const decodeCheckpoint: {
  (
    input: typeof DriverCheckpoint.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<DriverCheckpoint, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: typeof DriverCheckpoint.Encoded) => Effect.Effect<DriverCheckpoint, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: typeof DriverCheckpoint.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<DriverCheckpoint, Schema.SchemaError, never> =>
    Schema.decodeEffect(DriverCheckpoint)(input, options),
)
export const encodeDecision: {
  (
    input: DriverDecision,
    options?: ParseOptions,
  ): Effect.Effect<typeof DriverDecision.Encoded, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: DriverDecision) => Effect.Effect<typeof DriverDecision.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: DriverDecision,
    options?: ParseOptions,
  ): Effect.Effect<typeof DriverDecision.Encoded, Schema.SchemaError, never> =>
    Schema.encodeEffect(DriverDecision)(input, options),
)
export const decodeDecision: {
  (
    input: typeof DriverDecision.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<DriverDecision, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: typeof DriverDecision.Encoded) => Effect.Effect<DriverDecision, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: typeof DriverDecision.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<DriverDecision, Schema.SchemaError, never> => Schema.decodeEffect(DriverDecision)(input, options),
)
export const encodeOutcome: {
  (
    input: OperationOutcome,
    options?: ParseOptions,
  ): Effect.Effect<typeof OperationOutcome.Encoded, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: OperationOutcome) => Effect.Effect<typeof OperationOutcome.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: OperationOutcome,
    options?: ParseOptions,
  ): Effect.Effect<typeof OperationOutcome.Encoded, Schema.SchemaError, never> =>
    Schema.encodeEffect(OperationOutcome)(input, options),
)
export const decodeOutcome: {
  (
    input: typeof OperationOutcome.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<OperationOutcome, Schema.SchemaError, never>
  (
    options?: ParseOptions,
  ): (input: typeof OperationOutcome.Encoded) => Effect.Effect<OperationOutcome, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length > 1 || (args.length === 1 && !isParseOptions(args[0])),
  (
    input: typeof OperationOutcome.Encoded,
    options?: ParseOptions,
  ): Effect.Effect<OperationOutcome, Schema.SchemaError, never> =>
    Schema.decodeEffect(OperationOutcome)(input, options),
)
export const isUnknownOutcome = (
  outcome: OperationOutcome,
): outcome is Extract<OperationOutcome, { _tag: "Unknown" }> => outcome._tag === "Unknown"
export const isSucceededOutcome = (
  outcome: OperationOutcome,
): outcome is Extract<OperationOutcome, { _tag: "Succeeded" }> => outcome._tag === "Succeeded"
export const isFailedOutcome = (outcome: OperationOutcome): outcome is Extract<OperationOutcome, { _tag: "Failed" }> =>
  outcome._tag === "Failed"
