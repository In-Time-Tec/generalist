import { Schema } from "effect"

/** Maximum UTF-16 code units carried by one frame and held by one cadence buffer. */
export const MaxPayloadCharacters = 4_096

/** Maximum queued preview events retained for one subscriber. */
export const SubscriberCapacity = 64

/** Maximum milliseconds that partial output waits for adjacent changes before flushing. */
export const MaxCadenceMillis = 50

const Channel = Schema.Literals(["reasoning", "text"])
type Channel = typeof Channel.Type

/** One ordered append to a model output channel. Offsets and deltas use UTF-16 code units. */
export const Change = Schema.Struct({
  channel: Channel,
  offset: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  delta: Schema.String.check(Schema.isMaxLength(MaxPayloadCharacters)),
})
export type Change = typeof Change.Type

/** A bounded append frame for one live provider attempt. */
export const Frame = Schema.TaggedStruct("ModelPreview", {
  runId: Schema.String,
  attemptFence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
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

/** Tombstone emitted when a Run's memory-only model preview lane is cleared. */
export const Cleared = Schema.TaggedStruct("ModelPreviewCleared", {
  runId: Schema.String,
  attemptFence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  generation: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})
export type Cleared = typeof Cleared.Type

/** One event from a Run's memory-only model preview lane. */
export const Event = Schema.Union([Frame, Cleared])
export type Event = typeof Event.Type
