import { Schema } from "effect"
import { ProviderUsage } from "./attempt/observation.js"
import { ActionableTaggedError, errorHint } from "../error-hint.js"

/** A model emitted parameters that do not satisfy the named Effect tool schema. */
export class InvalidToolCallParameters extends ActionableTaggedError<InvalidToolCallParameters>()(
  "generalist/core/InvalidToolCallParameters",
  {
    toolName: Schema.String,
    providerUsage: Schema.optionalKey(ProviderUsage),
    hint: errorHint(
      "Correct the named tool's parameters or let the configured correction attempt ask the model again.",
    ),
  },
) {}

/** Tool correction was enabled for schema-backed tools, but the active model has no exact compiler. */
export class ToolJsonSchemaCompilerMissing extends ActionableTaggedError<ToolJsonSchemaCompilerMissing>()(
  "generalist/core/ToolJsonSchemaCompilerMissing",
  {
    hint: errorHint("Register the active provider's exact tool JSON Schema compiler or disable correction."),
  },
) {}

/** Test whether a failure is the precise Generalist-owned correction signal. */
export const isInvalidToolCallParameters = Schema.is(InvalidToolCallParameters)
