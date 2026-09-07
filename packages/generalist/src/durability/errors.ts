import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../core/error-hint.js"
import { ObjectStoreFailure } from "./object-store.js"

/** A canonical durability boundary could not establish a safe result. */
export class DurabilityFailure extends ActionableTaggedError<DurabilityFailure>()(
  "generalist/durability/DurabilityFailure",
  {
    reason: Schema.Literals([
      "corruption",
      "unsupported-version",
      "limit",
      "input-conflict",
      "indeterminate",
      "configuration",
      "encoding",
      "crypto",
      "transport",
      "contention",
    ]),
    message: Schema.String,
    key: Schema.optionalKey(Schema.String),
    commandId: Schema.optionalKey(Schema.String),
    cause: Schema.optionalKey(ObjectStoreFailure),
    hint: errorHint(
      "Preserve the canonical objects. Reconcile indeterminate commands by their original identity before executing external effects; repair corruption or configuration before writing.",
    ),
  },
) {}
