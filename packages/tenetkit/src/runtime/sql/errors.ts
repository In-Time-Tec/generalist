import { Schema } from "effect"

export class SchemaDirty extends Schema.TaggedError<SchemaDirty>()("tenetkit/runtime/SchemaDirty", {
  source: Schema.String,
  version: Schema.Finite,
}) {}

export class SchemaChecksumMismatch extends Schema.TaggedError<SchemaChecksumMismatch>()(
  "tenetkit/runtime/SchemaChecksumMismatch",
  {
    source: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {}

export class SchemaVersionUnsupported extends Schema.TaggedError<SchemaVersionUnsupported>()(
  "tenetkit/runtime/SchemaVersionUnsupported",
  {
    source: Schema.String,
    version: Schema.Finite,
    supported: Schema.Finite,
  },
) {}

export class SchemaUpgradeRequired extends Schema.TaggedError<SchemaUpgradeRequired>()(
  "tenetkit/runtime/SchemaUpgradeRequired",
  {
    source: Schema.String,
    current: Schema.Finite,
    required: Schema.Finite,
  },
) {}

export class MultiWorkerUnsupported extends Schema.TaggedError<MultiWorkerUnsupported>()(
  "tenetkit/runtime/MultiWorkerUnsupported",
  {
    backend: Schema.Literals(["sqlite", "mysql"]),
    message: Schema.String,
  },
) {}

export class SchemaMigrationFailed extends Schema.TaggedError<SchemaMigrationFailed>()(
  "tenetkit/runtime/SchemaMigrationFailed",
  {
    source: Schema.String,
    message: Schema.String,
  },
) {}

export class StaleClaim extends Schema.TaggedError<StaleClaim>()("tenetkit/runtime/StaleClaim", {
  runId: Schema.String,
  workerId: Schema.String,
  attemptFence: Schema.Finite,
}) {}

/** @experimental An exact Runtime Session write binding has been revoked or replaced. */
export class StaleSessionClaim extends Schema.TaggedError<StaleSessionClaim>()("tenetkit/runtime/StaleSessionClaim", {
  sessionId: Schema.String,
  runId: Schema.String,
  ownerId: Schema.String,
  runAttemptFence: Schema.Finite,
  epoch: Schema.String,
}) {}
