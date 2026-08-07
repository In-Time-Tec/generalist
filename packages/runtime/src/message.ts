import { Effect, Function, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { ParseOptions } from "effect/SchemaAST"
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

const isParseOptions = (value: unknown): value is ParseOptions =>
  typeof value === "object" &&
  value !== null &&
  ("errors" in value ||
    "onExcessProperty" in value ||
    "propertyOrder" in value ||
    "disableChecks" in value ||
    "concurrency" in value)

export const encode: {
  (input: Message, options?: ParseOptions): Effect.Effect<typeof Message.Encoded, Schema.SchemaError, never>
  (options?: ParseOptions): (input: Message) => Effect.Effect<typeof Message.Encoded, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: Message, options?: ParseOptions) => Schema.encodeEffect(Message)(input, options),
)

export const decode: {
  (input: typeof Message.Encoded, options?: ParseOptions): Effect.Effect<Message, Schema.SchemaError, never>
  (options?: ParseOptions): (input: typeof Message.Encoded) => Effect.Effect<Message, Schema.SchemaError, never>
} = Function.dual(
  (args) => args.length >= 2 || !isParseOptions(args[0]),
  (input: typeof Message.Encoded, options?: ParseOptions) => Schema.decodeEffect(Message)(input, options),
)
