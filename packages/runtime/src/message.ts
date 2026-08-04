import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address } from "./address.js"

export const Metadata = Schema.Record(Schema.String, Schema.Unknown)
export type Metadata = typeof Metadata.Type

export const Message = Schema.Struct({
  id: Schema.String,
  to: Address,
  from: Schema.optionalKey(Address),
  sessionId: Schema.String,
  prompt: Prompt.Prompt,
  idempotencyKey: Schema.String,
  causationId: Schema.optionalKey(Schema.String),
  correlationId: Schema.String,
  inReplyTo: Schema.optionalKey(Schema.String),
  metadata: Metadata,
})
export type Message = typeof Message.Type

export const make = (input: {
  readonly id: string
  readonly to: Address
  readonly from?: Address
  readonly sessionId: string
  readonly prompt: Prompt.Prompt
  readonly idempotencyKey: string
  readonly causationId?: string
  readonly correlationId: string
  readonly inReplyTo?: string
  readonly metadata?: Metadata
}): Message => ({
  id: input.id,
  to: input.to,
  sessionId: input.sessionId,
  prompt: input.prompt,
  idempotencyKey: input.idempotencyKey,
  correlationId: input.correlationId,
  metadata: input.metadata ?? {},
  ...(input.from === undefined ? {} : { from: input.from }),
  ...(input.causationId === undefined ? {} : { causationId: input.causationId }),
  ...(input.inReplyTo === undefined ? {} : { inReplyTo: input.inReplyTo }),
})

export const encode = Schema.encodeEffect(Message)
export const decode = Schema.decodeEffect(Message)
