import { Effect, Predicate, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { ParseOptions } from "effect/SchemaAST"
import { Address } from "../address.js"

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
}): Message => {
  const message: Message = {
    id: input.id,
    to: input.to,
    sessionId: input.sessionId,
    prompt: input.prompt,
    idempotencyKey: input.idempotencyKey,
    correlationId: input.correlationId,
    metadata: input.metadata ?? {},
  }
  if (input.from !== undefined) Object.assign(message, { from: input.from })
  if (input.causationId !== undefined) Object.assign(message, { causationId: input.causationId })
  if (input.inReplyTo !== undefined) Object.assign(message, { inReplyTo: input.inReplyTo })
  return message
}

const isParseOptions = (value: Message | typeof Message.Encoded | ParseOptions | undefined): value is ParseOptions =>
  Predicate.isObject(value) &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

export function encode(
  input: Message,
  options?: ParseOptions,
): Effect.Effect<typeof Message.Encoded, Schema.SchemaError, never>
export function encode(
  options?: ParseOptions,
): (input: Message) => Effect.Effect<typeof Message.Encoded, Schema.SchemaError, never>
export function encode(input?: Message | ParseOptions, options?: ParseOptions) {
  if (input === undefined || isParseOptions(input))
    return (message: Message) => Schema.encodeEffect(Message)(message, input)
  return Schema.encodeEffect(Message)(input, options)
}

export function decode(
  input: typeof Message.Encoded,
  options?: ParseOptions,
): Effect.Effect<Message, Schema.SchemaError, never>
export function decode(
  options?: ParseOptions,
): (input: typeof Message.Encoded) => Effect.Effect<Message, Schema.SchemaError, never>
export function decode(input?: typeof Message.Encoded | ParseOptions, options?: ParseOptions) {
  if (input === undefined || isParseOptions(input))
    return (message: typeof Message.Encoded) => Schema.decodeEffect(Message)(message, input)
  return Schema.decodeEffect(Message)(input, options)
}
