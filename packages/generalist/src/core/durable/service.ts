import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { ExecutableRef } from "./manifest/executable-manifest.js"
import type { DriverCheckpoint, DriverDecision, OperationOutcome } from "./driver/contract.js"
import type { RunBudget } from "./run-budget.js"

/** @experimental Input used to construct the first checkpoint for one run. */
export interface DriverInput {
  readonly executable?: ExecutableRef
  readonly prompt: Prompt.Prompt
  readonly budget: RunBudget
  readonly resume?: unknown
}

/** @experimental Versioned durable agent driver shared by inline and runtime execution. */
export interface DurableAgentDriver {
  readonly version: string
  readonly initial: (input: DriverInput) => Effect.Effect<DriverCheckpoint, DriverError>
  readonly decide: (checkpoint: DriverCheckpoint) => Effect.Effect<DriverDecision, DriverError | DriverStateInvalid>
  readonly apply: (
    checkpoint: DriverCheckpoint,
    outcome: OperationOutcome,
  ) => Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid>
}

/** @experimental */
export class DriverError extends Schema.TaggedError<DriverError>()("generalist/core/DriverError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental */
export class DriverVersionMismatch extends Schema.TaggedError<DriverVersionMismatch>()(
  "generalist/core/DriverVersionMismatch",
  {
    expected: Schema.String,
    actual: Schema.String,
  },
) {}

/** @experimental */
export class DriverStateInvalid extends Schema.TaggedError<DriverStateInvalid>()("generalist/core/DriverStateInvalid", {
  message: Schema.String,
}) {}

/** @experimental */
export const requireDriverVersion: {
  (version: string): (checkpoint: Pick<DriverCheckpoint, "driverVersion">) => Effect.Effect<void, DriverVersionMismatch>
  (checkpoint: Pick<DriverCheckpoint, "driverVersion">, version: string): Effect.Effect<void, DriverVersionMismatch>
} = Function.dual(
  2,
  (checkpoint: Pick<DriverCheckpoint, "driverVersion">, version: string): Effect.Effect<void, DriverVersionMismatch> =>
    checkpoint.driverVersion === version
      ? Effect.void
      : Effect.fail(DriverVersionMismatch.make({ expected: version, actual: checkpoint.driverVersion })),
)
