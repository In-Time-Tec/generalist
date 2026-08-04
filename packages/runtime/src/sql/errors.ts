import { Schema } from "effect"

export class SchemaDirty extends Schema.TaggedErrorClass<SchemaDirty>()("@batonfx/runtime/SchemaDirty", {
  source: Schema.String,
  version: Schema.Finite,
}) {}

export class SchemaChecksumMismatch extends Schema.TaggedErrorClass<SchemaChecksumMismatch>()(
  "@batonfx/runtime/SchemaChecksumMismatch",
  {
    source: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {}

export class SchemaVersionUnsupported extends Schema.TaggedErrorClass<SchemaVersionUnsupported>()(
  "@batonfx/runtime/SchemaVersionUnsupported",
  {
    source: Schema.String,
    version: Schema.Finite,
    supported: Schema.Finite,
  },
) {}

export class SchemaUpgradeRequired extends Schema.TaggedErrorClass<SchemaUpgradeRequired>()(
  "@batonfx/runtime/SchemaUpgradeRequired",
  {
    source: Schema.String,
    current: Schema.Finite,
    required: Schema.Finite,
  },
) {}

export class MultiWorkerUnsupported extends Schema.TaggedErrorClass<MultiWorkerUnsupported>()(
  "@batonfx/runtime/MultiWorkerUnsupported",
  {
    backend: Schema.Literals(["sqlite", "mysql"]),
    message: Schema.String,
  },
) {}

export class SchemaMigrationFailed extends Schema.TaggedErrorClass<SchemaMigrationFailed>()(
  "@batonfx/runtime/SchemaMigrationFailed",
  {
    source: Schema.String,
    message: Schema.String,
  },
) {}

export class StaleClaim extends Schema.TaggedErrorClass<StaleClaim>()("@batonfx/runtime/StaleClaim", {
  runId: Schema.String,
  workerId: Schema.String,
  attemptFence: Schema.Finite,
}) {}
