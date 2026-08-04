import { Schema } from "effect"
import { ExecutableRef } from "./executable-manifest.js"
import { RunBudget } from "./run-budget.js"
import { digest as canonicalDigest } from "./canonical-json.js"

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
export const encodeCheckpoint = Schema.encodeEffect(DriverCheckpoint)

/** @experimental */
export const decodeCheckpoint = Schema.decodeEffect(DriverCheckpoint)

/** @experimental */
export const encodeDecision = Schema.encodeEffect(DriverDecision)

/** @experimental */
export const decodeDecision = Schema.decodeEffect(DriverDecision)

/** @experimental */
export const encodeOutcome = Schema.encodeEffect(OperationOutcome)

/** @experimental */
export const decodeOutcome = Schema.decodeEffect(OperationOutcome)

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
