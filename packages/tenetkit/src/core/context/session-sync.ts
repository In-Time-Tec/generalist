import { Equal, Option, Schema } from "effect"
import { dual } from "effect/Function"
import { Prompt } from "effect/unstable/ai"

/** @experimental First structurally divergent position between the Session projection and live Chat history. */
export const Divergence = Schema.Struct({
  index: Schema.Finite,
  durableRole: Schema.optionalKey(Schema.String),
  authoritativeRole: Schema.optionalKey(Schema.String),
  durablePartTypes: Schema.Array(Schema.String),
  authoritativePartTypes: Schema.Array(Schema.String),
  durableDigest: Schema.optionalKey(Schema.String),
  authoritativeDigest: Schema.optionalKey(Schema.String),
})

/** @experimental */
export type Divergence = typeof Divergence.Type

/** @experimental Bounded structural evidence for a Session/Chat divergence. Carries counts, roles, part types, and digests only — never raw prompt, message, or tool payload text. */
export const Diagnostics = Schema.Struct({
  sessionId: Schema.String,
  durableEntryCount: Schema.Finite,
  durableMessageCount: Schema.Finite,
  authoritativeMessageCount: Schema.Finite,
  alignmentCount: Schema.Finite,
  commonPrefixLength: Schema.Finite,
  lastDurableEntryTag: Schema.optionalKey(Schema.String),
  firstDivergence: Schema.optionalKey(Divergence),
})

/** @experimental */
export type Diagnostics = typeof Diagnostics.Type

const digest = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const partTypes = (message: Prompt.Message): ReadonlyArray<string> =>
  Schema.is(Schema.String)(message.content) ? ["text"] : message.content.map((part) => part.type)

const sameOptions = (left: Prompt.Part, right: Prompt.Part): boolean =>
  JSON.stringify(left.options ?? {}) === JSON.stringify(right.options ?? {})

const coalesceParts = (parts: ReadonlyArray<Prompt.Part>): ReadonlyArray<Prompt.Part> => {
  const merged: Array<Prompt.Part> = []
  for (const part of parts) {
    const previous = merged[merged.length - 1]
    if (part.type === "text" && previous !== undefined && previous.type === "text" && sameOptions(previous, part)) {
      merged[merged.length - 1] = Prompt.makePart("text", {
        text: previous.text + part.text,
        options: previous.options,
      })
      continue
    }
    merged.push(part)
  }
  return merged
}

/**
 * @experimental Merge consecutive text parts that share options within each message.
 *
 * The provider-agnostic Chat export encodes a user message whose content is a
 * multi-text-part array by keeping only the first text part, silently dropping the
 * rest. Coalescing adjacent text parts into one before that encoding is lossless —
 * providers already concatenate adjacent text — and keeps the live Chat history
 * a faithful prefix of the durable session projection. It also canonicalizes a
 * message for structural comparison so a representation-only difference between the
 * live Chat projection and the authoritative Session history never reads as divergence.
 */
export const coalesceAdjacentText = (message: Prompt.Message): Prompt.Message => {
  if (Schema.is(Schema.String)(message.content) || message.content.length < 2) return message
  const coalesced = coalesceParts(message.content)
  if (coalesced.length === message.content.length) return message
  const encoded = Schema.encodeSync(Prompt.Message)(message)
  return Schema.decodeSync(Prompt.Message)(Object.assign(encoded, { content: coalesced }))
}

const compareKeys = ([left]: [string, Schema.Json], [right]: [string, Schema.Json]): number => {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

const canonicalValue = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  const record = Schema.decodeUnknownOption(Schema.JsonObject)(value)
  if (Option.isSome(record)) {
    return Object.fromEntries(
      Object.entries(record.value)
        .toSorted(compareKeys)
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}

const messageJson = (message: Prompt.Message): Schema.Json =>
  Schema.decodeUnknownSync(Schema.Json)(JSON.parse(JSON.stringify(Schema.encodeSync(Prompt.Message)(message))))

/** @experimental Compares prompt messages by canonical content across equivalent runtime representations. */
export const equivalentMessages: {
  (right: Prompt.Message): (left: Prompt.Message) => boolean
  (left: Prompt.Message, right: Prompt.Message): boolean
} = dual(2, (left: Prompt.Message, right: Prompt.Message): boolean =>
  Equal.equals(
    canonicalValue(messageJson(coalesceAdjacentText(left))),
    canonicalValue(messageJson(coalesceAdjacentText(right))),
  ),
)

const messageDigest = (message: Prompt.Message): string => digest(JSON.stringify(message))

const alignmentCount = (
  projection: ReadonlyArray<Prompt.Message>,
  transcript: ReadonlyArray<Prompt.Message>,
): number => {
  if (projection.length === 0) return 1
  let count = 0
  for (let start = 0; start <= transcript.length - projection.length; start += 1) {
    const aligned = projection.every((message, index) => {
      const candidate = transcript.at(start + index)
      return candidate !== undefined && equivalentMessages(message, candidate)
    })
    if (transcript.slice(0, start).every((message) => message.role === "system") && aligned) count += 1
  }
  return count
}

const commonPrefixLength = (
  projection: ReadonlyArray<Prompt.Message>,
  transcript: ReadonlyArray<Prompt.Message>,
): number => {
  let length = 0
  while (true) {
    const durable = projection.at(length)
    const authoritative = transcript.at(length)
    if (durable === undefined || authoritative === undefined || !equivalentMessages(durable, authoritative))
      return length
    length += 1
  }
}

/** @experimental Computes bounded divergence diagnostics for a failed Session synchronization. */
export const diagnose = (input: {
  readonly sessionId: string
  readonly durableEntryTags: ReadonlyArray<string>
  readonly projection: ReadonlyArray<Prompt.Message>
  readonly transcript: ReadonlyArray<Prompt.Message>
}): Diagnostics => {
  const alignment = alignmentCount(input.projection, input.transcript)
  const prefixLength = commonPrefixLength(input.projection, input.transcript)
  const durable = input.projection[prefixLength]
  const authoritative = input.transcript[prefixLength]
  const lastDurableEntryTag = input.durableEntryTags.at(-1)
  const diagnostics: Diagnostics = {
    sessionId: input.sessionId,
    durableEntryCount: input.durableEntryTags.length,
    durableMessageCount: input.projection.length,
    authoritativeMessageCount: input.transcript.length,
    alignmentCount: alignment,
    commonPrefixLength: prefixLength,
  }
  if (lastDurableEntryTag !== undefined) Object.assign(diagnostics, { lastDurableEntryTag })
  if (durable === undefined && authoritative === undefined) return diagnostics
  const firstDivergence: Divergence = {
    index: prefixLength,
    durablePartTypes: durable === undefined ? [] : partTypes(durable),
    authoritativePartTypes: authoritative === undefined ? [] : partTypes(authoritative),
  }
  if (durable !== undefined) {
    Object.assign(firstDivergence, { durableRole: durable.role, durableDigest: messageDigest(durable) })
  }
  if (authoritative !== undefined) {
    Object.assign(firstDivergence, {
      authoritativeRole: authoritative.role,
      authoritativeDigest: messageDigest(authoritative),
    })
  }
  return Object.assign(diagnostics, { firstDivergence })
}
