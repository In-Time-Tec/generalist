import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { ExecutableRef } from "./manifest/executable-manifest.js"
import type { DriverCheckpoint, DriverDecision, OperationOutcome } from "./driver/contract.js"
import type { RunBudget } from "./run-budget.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

/** Input used to construct the first checkpoint for one run. */
export interface DriverInput {
  readonly executable?: ExecutableRef
  readonly prompt: Prompt.Prompt
  readonly budget: RunBudget
  readonly resume?: unknown
}

/** Versioned durable agent driver shared by inline and runtime execution. */
export interface DurableAgentDriver {
  readonly version: string
  readonly initial: (input: DriverInput) => Effect.Effect<DriverCheckpoint, DriverError>
  readonly decide: (checkpoint: DriverCheckpoint) => Effect.Effect<DriverDecision, DriverError | DriverStateInvalid>
  readonly apply: (
    checkpoint: DriverCheckpoint,
    outcome: OperationOutcome,
  ) => Effect.Effect<DriverCheckpoint, DriverError | DriverStateInvalid>
}
export class DriverError extends ActionableTaggedError<DriverError>()("generalist/core/DriverError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  hint: errorHint("Inspect the cause, repair the durable driver boundary, and resume from its last checkpoint."),
}) {}
export class DriverVersionMismatch extends ActionableTaggedError<DriverVersionMismatch>()(
  "generalist/core/DriverVersionMismatch",
  {
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Use the driver version recorded by the checkpoint or migrate the checkpoint explicitly."),
  },
) {}
export class DriverStateInvalid extends ActionableTaggedError<DriverStateInvalid>()(
  "generalist/core/DriverStateInvalid",
  {
    message: Schema.String,
    hint: errorHint("Repair or discard the invalid checkpoint before resuming this Run."),
  },
) {}
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
