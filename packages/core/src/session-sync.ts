import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

/** @experimental First structurally divergent position between the durable projection and the authoritative Chat history. */
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
  ownerToken: Schema.optionalKey(Schema.String),
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
  typeof message.content === "string" ? ["text"] : message.content.map((part) => part.type)

const messageDigest = (message: Prompt.Message): string => digest(JSON.stringify(message))

/** @experimental Computes bounded divergence diagnostics for a failed Session synchronization. */
export const diagnose = (input: {
  readonly sessionId: string
  readonly ownerToken?: string
  readonly durableEntryTags: ReadonlyArray<string>
  readonly projection: ReadonlyArray<Prompt.Message>
  readonly transcript: ReadonlyArray<Prompt.Message>
}): Diagnostics => {
  const equals = Schema.toEquivalence(Prompt.Message)
  let alignmentCount = 0
  if (input.projection.length === 0) alignmentCount = 1
  else
    for (let start = 0; start <= input.transcript.length - input.projection.length; start += 1) {
      if (
        input.transcript.slice(0, start).every((message) => message.role === "system") &&
        input.projection.every((message, index) => equals(message, input.transcript[start + index] as Prompt.Message))
      )
        alignmentCount += 1
    }
  let commonPrefixLength = 0
  while (
    commonPrefixLength < input.projection.length &&
    commonPrefixLength < input.transcript.length &&
    equals(
      input.projection[commonPrefixLength] as Prompt.Message,
      input.transcript[commonPrefixLength] as Prompt.Message,
    )
  )
    commonPrefixLength += 1
  const durable = input.projection[commonPrefixLength]
  const authoritative = input.transcript[commonPrefixLength]
  const lastDurableEntryTag = input.durableEntryTags.at(-1)
  return {
    sessionId: input.sessionId,
    ...(input.ownerToken === undefined ? {} : { ownerToken: input.ownerToken }),
    durableEntryCount: input.durableEntryTags.length,
    durableMessageCount: input.projection.length,
    authoritativeMessageCount: input.transcript.length,
    alignmentCount,
    commonPrefixLength,
    ...(lastDurableEntryTag === undefined ? {} : { lastDurableEntryTag }),
    ...(durable === undefined && authoritative === undefined
      ? {}
      : {
          firstDivergence: {
            index: commonPrefixLength,
            ...(durable === undefined ? {} : { durableRole: durable.role }),
            ...(authoritative === undefined ? {} : { authoritativeRole: authoritative.role }),
            durablePartTypes: durable === undefined ? [] : partTypes(durable),
            authoritativePartTypes: authoritative === undefined ? [] : partTypes(authoritative),
            ...(durable === undefined ? {} : { durableDigest: messageDigest(durable) }),
            ...(authoritative === undefined ? {} : { authoritativeDigest: messageDigest(authoritative) }),
          },
        }),
  }
}
