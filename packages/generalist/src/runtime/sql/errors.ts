import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

export class SchemaDirty extends ActionableTaggedError<SchemaDirty>()("generalist/runtime/SchemaDirty", {
  source: Schema.String,
  version: Schema.Finite,
  hint: errorHint("Finish or roll back the interrupted migration before starting the Runtime."),
}) {}

export class SchemaChecksumMismatch extends ActionableTaggedError<SchemaChecksumMismatch>()(
  "generalist/runtime/SchemaChecksumMismatch",
  {
    source: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Restore the exact recorded migration or install a schema whose checksum matches."),
  },
) {}

export class SchemaVersionUnsupported extends ActionableTaggedError<SchemaVersionUnsupported>()(
  "generalist/runtime/SchemaVersionUnsupported",
  {
    source: Schema.String,
    version: Schema.Finite,
    supported: Schema.Finite,
    hint: errorHint("Run a Generalist version that supports this schema, or migrate through supported versions."),
  },
) {}

export class SchemaUpgradeRequired extends ActionableTaggedError<SchemaUpgradeRequired>()(
  "generalist/runtime/SchemaUpgradeRequired",
  {
    source: Schema.String,
    current: Schema.Finite,
    required: Schema.Finite,
    hint: errorHint("Apply the required Runtime schema migration before starting workers."),
  },
) {}

export class MultiWorkerUnsupported extends ActionableTaggedError<MultiWorkerUnsupported>()(
  "generalist/runtime/MultiWorkerUnsupported",
  {
    backend: Schema.Literals(["sqlite", "mysql"]),
    message: Schema.String,
    hint: errorHint("Use this backend in its supported worker mode or choose a multi-worker adapter."),
  },
) {}

export class SchemaMigrationFailed extends ActionableTaggedError<SchemaMigrationFailed>()(
  "generalist/runtime/SchemaMigrationFailed",
  {
    source: Schema.String,
    message: Schema.String,
    hint: errorHint("Inspect the migration failure, repair the database condition, and rerun the migration."),
  },
) {}

export class StaleClaim extends ActionableTaggedError<StaleClaim>()("generalist/runtime/StaleClaim", {
  runId: Schema.String,
  workerId: Schema.String,
  attemptFence: Schema.Finite,
  hint: errorHint("Stop mutating with this stale claim and reacquire the Run with a current fence."),
}) {}

/** An exact Runtime Session write binding has been revoked or replaced. */
export class StaleSessionClaim extends ActionableTaggedError<StaleSessionClaim>()(
  "generalist/runtime/StaleSessionClaim",
  {
    sessionId: Schema.String,
    runId: Schema.String,
    ownerId: Schema.String,
    runAttemptFence: Schema.Finite,
    epoch: Schema.String,
    hint: errorHint("Stop Session writes and reacquire the Session writer claim with its current epoch."),
  },
) {}
