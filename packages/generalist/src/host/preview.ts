import { Schema } from "effect"
import { Event as ModelPreviewEvent } from "../runtime/execution/model-response/preview.js"

/** One memory-only preview admitted by the Host against current storage authority. */
export const PreviewDelivery = Schema.TaggedStruct("PreviewDelivery", {
  sessionId: Schema.String,
  runId: Schema.String,
  authorityAttemptFence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  event: ModelPreviewEvent,
})
export type PreviewDelivery = typeof PreviewDelivery.Type
