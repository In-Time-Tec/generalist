import { Schema } from "effect"
import {
  AwaitEvent,
  WakeEvent,
  type WakeEvent as WakeEventType,
  type WakeEventFilter,
} from "../../core/agent/tools/wake-event.js"
import type { RunEventBase } from "./event.js"

export type Awaiting = RunEventBase & {
  readonly _tag: "Awaiting"
  readonly waitId: string
  readonly filter: WakeEventFilter
  readonly deadline: string
}
export type Duplicate = RunEventBase & { readonly _tag: "Duplicate"; readonly dedupeKey: string }
export type TimedOut = RunEventBase & { readonly _tag: "TimedOut"; readonly waitId: string; readonly deadline: string }
export type WakeReceived = RunEventBase & { readonly _tag: "WakeReceived"; readonly event: WakeEventType }
export type TriggerEvent = Awaiting | Duplicate | TimedOut | WakeReceived

export const TriggerTags = ["Awaiting", "Duplicate", "TimedOut", "WakeReceived"] as const

export const TriggerEventSchema = Schema.Union([
  Schema.TaggedStruct("Awaiting", {
    waitId: Schema.String,
    filter: AwaitEvent.fields.filter,
    deadline: Schema.String,
  }),
  Schema.TaggedStruct("Duplicate", { dedupeKey: Schema.String }),
  Schema.TaggedStruct("TimedOut", { waitId: Schema.String, deadline: Schema.String }),
  Schema.TaggedStruct("WakeReceived", { event: WakeEvent }),
])
