import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** Package resolution or loading failed. */
export class PackageCatalogError extends ActionableTaggedError<PackageCatalogError>()("PackageCatalogError", {
  source: Schema.String,
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
  hint: errorHint("Inspect cause and correct the package source, resolution, or loader configuration."),
}) {}

/** A package does not match its locked integrity or resolution. */
export class PackageIntegrityMismatch extends ActionableTaggedError<PackageIntegrityMismatch>()(
  "PackageIntegrityMismatch",
  {
    specifier: Schema.String,
    expected: Schema.String,
    actual: Schema.String,
    hint: errorHint("Restore the locked package content or update the lock to the intended verified artifact."),
  },
) {}
