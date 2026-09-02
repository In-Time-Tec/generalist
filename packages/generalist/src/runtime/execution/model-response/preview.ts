type Channel = "reasoning" | "text"

/** One ordered append to a model output channel. Offsets and deltas use UTF-16 code units. */
export interface Change {
  readonly channel: Channel
  readonly offset: number
  readonly delta: string
}

/** A bounded append frame for one live provider attempt. */
export interface Frame {
  readonly _tag: "ModelPreview"
  readonly runId: string
  readonly attemptFence: number
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly sequence: number
  readonly changes: readonly [Change, ...ReadonlyArray<Change>]
}

/** Tombstone emitted when a Run's memory-only model preview lane is cleared. */
export interface Cleared {
  readonly _tag: "ModelPreviewCleared"
  readonly runId: string
  readonly attemptFence: number
  readonly generation: number
}

/** One event from a Run's memory-only model preview lane. */
export type Event = Frame | Cleared

/** Maximum UTF-16 code units carried by one frame and held by one cadence buffer. */
export const MaxPayloadCharacters = 4_096

/** Maximum queued preview events retained for one subscriber. */
export const SubscriberCapacity = 64

/** Maximum milliseconds that partial output waits for adjacent changes before flushing. */
export const MaxCadenceMillis = 50
