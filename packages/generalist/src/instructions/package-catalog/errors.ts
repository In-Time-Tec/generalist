import { Schema } from "effect"

/** @experimental Package resolution or loading failed. */
export class PackageCatalogError extends Schema.TaggedError<PackageCatalogError>()("PackageCatalogError", {
  source: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

/** @experimental A package does not match its locked integrity or resolution. */
export class PackageIntegrityMismatch extends Schema.TaggedError<PackageIntegrityMismatch>()(
  "PackageIntegrityMismatch",
  {
    specifier: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
  },
) {}
