import { digest as pinDigest } from "../../core/durable/pin.js"
import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Address } from "../address.js"
import { Metadata } from "./message.js"

/**
 * @experimental Bounds one durable inbox.
 *
 * Bounds are enforced at admission so a sender learns immediately that its message was refused
 * instead of discovering silent loss later.
 */
export interface MailboxBounds {
  readonly maxPending: number
  readonly maxPendingBytes: number
  readonly maxPerWindow: number
  readonly windowMillis: number
}

/** @experimental */
export const defaultBounds: MailboxBounds = {
  maxPending: 256,
  maxPendingBytes: 1_048_576,
  maxPerWindow: 64,
  windowMillis: 60_000,
}

/**
 * @experimental One durable message admitted to a target inbox.
 *
 * `sequence` is the total order for the target. `deliveredRunId` records the Run that took the
 * entry; until then the entry is pending and survives Server restart.
 */
export interface MailboxEntry {
  readonly entryId: string
  readonly targetSessionId: string
  readonly sequence: number
  readonly from: Address
  readonly fromRunId: string
  readonly to: Address
  readonly messageId: string
  readonly idempotencyKey: string
  readonly digest: string
  readonly bytes: number
  readonly admittedAtMillis: number
  readonly prompt: Prompt.Prompt
  readonly correlationId: string
  readonly causationId?: string
  readonly inReplyTo?: string
  readonly metadata: Metadata
  readonly deliveredRunId?: string
  readonly steeringEntryId?: string
}

interface MailboxEntryEncoded extends Omit<MailboxEntry, "from" | "to" | "prompt"> {
  readonly from: string
  readonly to: string
  readonly prompt: typeof Prompt.Prompt.Encoded
}

/** @experimental */
export const MailboxEntry: Schema.Codec<MailboxEntry, MailboxEntryEncoded> = Schema.Struct({
  entryId: Schema.String,
  targetSessionId: Schema.String,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  from: Address,
  fromRunId: Schema.String,
  to: Address,
  messageId: Schema.String,
  idempotencyKey: Schema.String,
  digest: Schema.String,
  bytes: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  admittedAtMillis: Schema.Finite,
  prompt: Prompt.Prompt,
  correlationId: Schema.String,
  causationId: Schema.optionalKey(Schema.String),
  inReplyTo: Schema.optionalKey(Schema.String),
  metadata: Metadata,
  deliveredRunId: Schema.optionalKey(Schema.String),
  steeringEntryId: Schema.optionalKey(Schema.String),
})

/** @experimental Receipt for one admitted message. */
export interface MessageReceipt {
  readonly messageId: string
  readonly entryId: string
  readonly sequence: number
  readonly duplicate: boolean
}

/** @experimental */
export const MessageReceipt: Schema.Codec<MessageReceipt, MessageReceipt> = Schema.Struct({
  messageId: Schema.String,
  entryId: Schema.String,
  sequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  duplicate: Schema.Boolean,
})

/**
 * @experimental Stable identity of one message payload.
 *
 * Two admissions carrying the same message id and idempotency key must carry the same digest, or
 * the second is a conflict rather than a duplicate.
 */
export const digest = (input: {
  readonly to: Address
  readonly from: Address
  readonly prompt: Prompt.Prompt
  readonly correlationId: string
  readonly causationId?: string
  readonly inReplyTo?: string
  readonly metadata: Metadata
}): string =>
  pinDigest({
    to: input.to,
    from: input.from,
    prompt: Schema.encodeSync(Prompt.Prompt)(input.prompt),
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    inReplyTo: input.inReplyTo ?? null,
    metadata: input.metadata,
  })

/** @experimental Encoded size charged against the inbox byte bound. */
export const promptBytes = (prompt: Prompt.Prompt): number =>
  new TextEncoder().encode(JSON.stringify(Schema.encodeSync(Prompt.Prompt)(prompt))).length

/** @experimental The steering idempotency key one mailbox entry delivers under. */
export const steeringKey = (entryId: string): string => `message:${entryId}`

/**
 * @experimental Render one entry as model-facing conversation carrying its authoritative sender.
 *
 * Delivery re-enters the model as ordinary user content, exactly like steering, so addressed
 * messaging adds no second payload vocabulary to the agent loop.
 */
const userParts = (message: Prompt.Message): ReadonlyArray<Prompt.UserMessagePart> => {
  if (message.role === "system") return [Prompt.makePart("text", { text: message.content })]
  const parts: Array<Prompt.UserMessagePart> = []
  for (const part of message.content) {
    if (part.type === "text" || part.type === "file") parts.push(part)
  }
  return parts
}

export const deliveryPrompt = (entry: MailboxEntry): Prompt.Prompt =>
  Prompt.fromMessages([
    Prompt.makeMessage("user", {
      content: entry.prompt.content.flatMap((message: Prompt.Message) => userParts(message)),
      options: { tenetkit: { message: { from: entry.from, messageId: entry.messageId } } },
    }),
  ])
