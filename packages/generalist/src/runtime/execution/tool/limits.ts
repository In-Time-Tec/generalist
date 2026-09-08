import { Effect, Schema } from "effect"
import type { Outcome } from "../../../core/tools/tool-executor.js"
import type { Progress } from "../../../core/tools/tool-context.js"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"

export const limits = {
  deadlineMs: 60_000,
  outputBytes: 256 * 1024,
  progressBytes: 16 * 1024,
  progressEvents: 64,
  artifactReferences: 16,
  artifactReferenceBytes: 2048,
} as const

export class ToolLimitExceeded extends ActionableTaggedError<ToolLimitExceeded>()(
  "generalist/runtime/ToolLimitExceeded",
  {
    message: Schema.String,
    hint: errorHint("Inspect the Tool operation and resolve its external outcome without blind redispatch."),
  },
) {}

export const bytes = (value: Outcome | Progress | string): Effect.Effect<number, ToolLimitExceeded> =>
  Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(value).pipe(
    Effect.map((encoded) => new TextEncoder().encode(encoded).byteLength),
    Effect.mapError(() => ToolLimitExceeded.make({ message: "Tool output must be JSON serializable" })),
  )
