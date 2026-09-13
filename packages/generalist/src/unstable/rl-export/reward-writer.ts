import { Effect, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

const RewardFields = Schema.Struct({
  runId: Schema.String,
  leaf: Schema.String,
  value: Schema.Finite,
  source: Schema.String,
})

/** One scalar reward assigned to a durable trajectory leaf. @experimental */
export interface RewardInput {
  readonly runId: string
  readonly leaf: string
  readonly value: number
  readonly source: string
}

/** The reward names a Run absent from this Runtime namespace. @experimental */
export class RewardRunNotFound extends ActionableTaggedError<RewardRunNotFound>()(
  "generalist/rl-export/RewardRunNotFound",
  {
    runId: Schema.String,
    hint: errorHint("Record rewards only for Runs in the acquired Runtime namespace."),
  },
) {}

/** A reward command identity was already committed with different fields. @experimental */
export class RewardConflict extends ActionableTaggedError<RewardConflict>()("generalist/rl-export/RewardConflict", {
  commandId: Schema.String,
  existing: RewardFields,
  received: RewardFields,
  hint: errorHint("Retry the original reward unchanged, or use a new command identity for a different reward."),
}) {}

/** Canonical storage could not establish the reward command's result. @experimental */
export class RewardStorageFailed extends ActionableTaggedError<RewardStorageFailed>()(
  "generalist/rl-export/RewardStorageFailed",
  {
    commandId: Schema.String,
    operation: Schema.Literal("record-reward"),
    message: Schema.String,
    hint: errorHint(
      "Reconcile uncertain writes by retrying the exact original command, without changing its identity.",
    ),
  },
) {}

/** The Runtime cannot currently authorize or reconcile reward recording. @experimental */
export class RewardRuntimeUnavailable extends ActionableTaggedError<RewardRuntimeUnavailable>()(
  "generalist/rl-export/RewardRuntimeUnavailable",
  {
    commandId: Schema.String,
    message: Schema.String,
    hint: errorHint("Use a ready Runtime with canonical reward-command provenance; never rewrite retained history."),
  },
) {}

/** Classified failures from the narrow reward-writing capability. @experimental */
export type RewardWriteError = RewardRunNotFound | RewardConflict | RewardStorageFailed | RewardRuntimeUnavailable

/** One command-idempotent mutation capability, with no other Runtime controls. @experimental */
export interface RewardWriter {
  readonly record: (input: RewardInput & { readonly commandId: string }) => Effect.Effect<void, RewardWriteError>
}
