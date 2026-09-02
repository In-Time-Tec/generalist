import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../../core/error-hint.js"

/** A Runtime wake value failed the public `WakeEvent` Schema. */
export class WakeEventInvalid extends ActionableTaggedError<WakeEventInvalid>()("generalist/runtime/WakeEventInvalid", {
  message: Schema.String,
  hint: errorHint("Decode the event with Agent.WakeEvent and provide a non-empty dedupeKey."),
}) {}

/** Result of admitting one validated wake event to a Run. */
export const WakeDisposition = Schema.Union([
  Schema.TaggedStruct("Resumed", { waitId: Schema.String }),
  Schema.TaggedStruct("Duplicate", {}),
  Schema.TaggedStruct("Ignored", {}),
])
export type WakeDisposition = typeof WakeDisposition.Type

/** One open await-event wait whose persisted deadline has elapsed. */
export interface DueAwaitEvent {
  readonly runId: string
  readonly waitId: string
  readonly deadline: string
}
