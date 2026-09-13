import { Schema } from "effect"
import { Change, MaxPayloadCharacters } from "./execution/model-response/preview.js"

export {
  Change,
  MaxCadenceMillis,
  MaxPayloadCharacters,
  SubscriberCapacity,
} from "./execution/model-response/preview.js"

export const Frame = Schema.TaggedStruct("ModelPreview", {
  runId: Schema.String,
  turn: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  modelCallId: Schema.String,
  modelAttemptId: Schema.String,
  attempt: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  changes: Schema.NonEmptyArray(Change),
}).pipe(
  Schema.refine(
    (frame): frame is typeof frame =>
      frame.changes.reduce((total, change) => total + change.delta.length, 0) <= MaxPayloadCharacters,
    { message: `preview frame payload must not exceed ${MaxPayloadCharacters} characters` },
  ),
)
export type Frame = typeof Frame.Type

export const Cleared = Schema.TaggedStruct("ModelPreviewCleared", {
  runId: Schema.String,
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Cleared = typeof Cleared.Type

export const Event = Schema.Union([Frame, Cleared])
export type Event = typeof Event.Type
