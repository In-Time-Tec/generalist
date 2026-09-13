import { type Effect, Schema } from "effect"
import { ReplayPolicy } from "../core/durable/driver/contract.js"
import type { Event } from "./event.js"

export const Identity = Schema.Struct({
  key: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
  version: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  replayPolicy: ReplayPolicy,
})
export type Identity = typeof Identity.Type

/** Plugin-facing type-erased declaration shape accepted by Hooks.layer. */
export interface Declaration extends Identity {
  readonly event: Event
  readonly hook: (input: never, context: { readonly operationKey: string }) => Effect.Effect<unknown, unknown>
}

/** Ordered lifecycle hook declarations for one Agent execution context. */
export interface Service {
  readonly declarations: ReadonlyArray<Declaration>
}
