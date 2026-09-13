import { Schema } from "effect"
import { CapabilityPin } from "../core/durable/pin.js"
import { Event } from "./event.js"
import { Decision } from "./decision.js"

/** One completed declaration chain stored in the driver checkpoint. */
export const Checkpoint = Schema.Struct({
  chain: CapabilityPin,
  key: Schema.String,
  event: Event,
  decisions: Schema.Array(Decision),
  complete: Schema.Boolean,
})
export type Checkpoint = typeof Checkpoint.Type
