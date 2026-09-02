import { Schema } from "effect"
import { CapabilityPin } from "./pin.js"

const MAX_TEXT_LENGTH = 255

/** Exact identity of the host-owned content one capability registration must reconstruct. */
export const PinnedContent = Schema.Struct({
  codec: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  version: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(MAX_TEXT_LENGTH)),
  digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
})
export type PinnedContent = typeof PinnedContent.Type

/** One named capability required by an Agent or Agent Program. */
export interface NamedCapability {
  readonly name: string
  readonly pin: CapabilityPin
  readonly content?: PinnedContent
}

export interface NamedCapabilityEncoded extends Omit<NamedCapability, "pin"> {
  readonly pin: string
}

/** One named capability required by an Agent or Agent Program. */
export const NamedCapability: Schema.Codec<NamedCapability, NamedCapabilityEncoded> = Schema.Struct({
  name: Schema.String,
  pin: CapabilityPin,
  content: Schema.optionalKey(PinnedContent),
})

/** A named capability whose name is bounded by one selection identifier. */
export const namedCapabilityWith = <Name extends Schema.Codec<string, string>>(name: Name) =>
  Schema.Struct({ name, pin: CapabilityPin, content: Schema.optionalKey(PinnedContent) })
