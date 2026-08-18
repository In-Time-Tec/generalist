import { Schema } from "effect"

export class SchemaDirty extends Schema.TaggedErrorClass<SchemaDirty>()("tenetkit/runtime/SchemaDirty", {
  source: Schema.String,
  version: Schema.Finite,
}) {}

export class SchemaChecksumMismatch extends Schema.TaggedErrorClass<SchemaChecksumMismatch>()(
  "tenetkit/runtime/SchemaChecksumMismatch",
  {
    source: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {}

export class SchemaVersionUnsupported extends Schema.TaggedErrorClass<SchemaVersionUnsupported>()(
  "tenetkit/runtime/SchemaVersionUnsupported",
  {
    source: Schema.String,
    version: Schema.Finite,
    supported: Schema.Finite,
  },
) {}

export class SchemaUpgradeRequired extends Schema.TaggedErrorClass<SchemaUpgradeRequired>()(
  "tenetkit/runtime/SchemaUpgradeRequired",
  {
    source: Schema.String,
    current: Schema.Finite,
    required: Schema.Finite,
  },
) {}

export class MultiWorkerUnsupported extends Schema.TaggedErrorClass<MultiWorkerUnsupported>()(
  "tenetkit/runtime/MultiWorkerUnsupported",
  {
    backend: Schema.Literals(["sqlite", "mysql"]),
    message: Schema.String,
  },
) {}

export class SchemaMigrationFailed extends Schema.TaggedErrorClass<SchemaMigrationFailed>()(
  "tenetkit/runtime/SchemaMigrationFailed",
  {
    source: Schema.String,
    message: Schema.String,
  },
) {}

export class StaleClaim extends Schema.TaggedErrorClass<StaleClaim>()("tenetkit/runtime/StaleClaim", {
  runId: Schema.String,
  workerId: Schema.String,
  attemptFence: Schema.Finite,
}) {}
