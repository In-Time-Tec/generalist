import { Effect, Function, Schema } from "effect"
import type { ParseOptions } from "effect/SchemaAST"
import { ExecutableRef } from "./executable-manifest.js"
import { RunBudget } from "./run-budget.js"
import { digest as canonicalDigest } from "./canonical-json.js"

const isParseOptions = (value: unknown): value is ParseOptions =>
  typeof value === "object" &&
  value !== null &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

/** @experimental Version string for a durable driver implementation. */
export const DriverVersion = Schema.String

/** @experimental */
export type DriverVersion = typeof DriverVersion.Type

/** @experimental Current durable driver contract version. */
export const currentDriverVersion = "1" as const

/** @experimental How a host may replay one persisted operation after recovery. */
export const ReplayPolicy = Schema.Literals(["pure", "provider-idempotent", "never"])

/** @experimental */
export type ReplayPolicy = typeof ReplayPolicy.Type

/** @experimental Bounded operation kinds the driver may schedule. */
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

/** @experimental */
export type DriverOperationKind = typeof DriverOperationKind.Type

/** @experimental One schedulable nondeterministic operation with deterministic identity. */
export const DriverOperation = Schema.Struct({
  key: Schema.String,
  kind: DriverOperationKind,
  input: Schema.Unknown,
  inputDigest: Schema.String,
  replayPolicy: ReplayPolicy,
})

/** @experimental */
export type DriverOperation = typeof DriverOperation.Type

/** @experimental Persisted outcome for one operation attempt. */
export const OperationOutcome = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Succeeded"), value: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Failed"), error: Schema.Unknown }),
  Schema.Struct({ _tag: Schema.tag("Unknown"), operationId: Schema.String }),
])

/** @experimental */
export type OperationOutcome = typeof OperationOutcome.Type

/** @experimental Wait the driver requests before the next decision. */
export const WaitDefinition = Schema.Struct({
  waitId: Schema.String,
  reason: Schema.String,
  replayToken: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type WaitDefinition = typeof WaitDefinition.Type

/** @experimental Reconstructable durable checkpoint for one agent run. */
export const DriverCheckpoint = Schema.Struct({
  driverVersion: DriverVersion,
  executable: Schema.optionalKey(ExecutableRef),
  turn: Schema.Finite,
  budget: RunBudget,
  state: Schema.Unknown,
})

/** @experimental */
export type DriverCheckpoint = typeof DriverCheckpoint.Type

/** @experimental Terminal structured result carried by a Complete decision. */
export const DriverResult = Schema.Struct({
  text: Schema.String,
  turns: Schema.Finite,
})

/** @experimental */
export type DriverResult = typeof DriverResult.Type

/** @experimental Next step chosen deterministically from one checkpoint. */
export const DriverDecision = Schema.Union([
  Schema.Struct({ _tag: Schema.tag("Execute"), operation: DriverOperation }),
  Schema.Struct({ _tag: Schema.tag("Wait"), wait: WaitDefinition }),
  Schema.Struct({ _tag: Schema.tag("Continue"), checkpoint: DriverCheckpoint }),
  Schema.Struct({ _tag: Schema.tag("Complete"), result: DriverResult }),
])

/** @experimental */
export type DriverDecision = typeof DriverDecision.Type

/** @experimental */
export const operationKey = (parts: ReadonlyArray<string | number>): string => parts.map(String).join(":")

/** @experimental */
export const inputDigest = (input: unknown): string => canonicalDigest(input)

/** @experimental */
export const makeOperation = (input: {
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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

/** @experimental */
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
/** @experimental */
export const isUnknownOutcome = (
  outcome: OperationOutcome,
): outcome is Extract<OperationOutcome, { _tag: "Unknown" }> => outcome._tag === "Unknown"

/** @experimental */
export const isSucceededOutcome = (
  outcome: OperationOutcome,
): outcome is Extract<OperationOutcome, { _tag: "Succeeded" }> => outcome._tag === "Succeeded"

/** @experimental */
export const isFailedOutcome = (outcome: OperationOutcome): outcome is Extract<OperationOutcome, { _tag: "Failed" }> =>
  outcome._tag === "Failed"
