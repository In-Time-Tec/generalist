import { Effect, Predicate, Schema } from "effect"
import { PayloadTooLarge } from "../../errors.js"

/** @internal Maximum JSON bytes in one durable value, not a history or Session lifetime limit. */
export const maximumBytes = 1024 * 1024
/** @internal Keep a 128-row event page below 32 MiB of serialized payload. */
export const maximumEventBytes = 256 * 1024

const rejected = (boundary: string, reason: string) =>
  PayloadTooLarge.make({
    boundary,
    message: `Durable ${boundary} rejected: ${reason}. Store large data externally and pass a bounded reference.`,
  })

/** Reject oversized/deep input before codecs, digests, or JSON allocate copies of it. */
// This pre-codec boundary must inspect unknown values before a schema can allocate their encoded copy.
// eslint-disable-next-line anti-slop/no-unknown-parameters
const checkInput = (value: unknown, boundary: string, limit = maximumBytes): void => {
  let remaining = limit
  let nodes = 0
  const ancestors = new Set<object>()
  // eslint-disable-next-line anti-slop/no-unknown-parameters -- recursive pre-codec size inspection, not domain parsing.
  const visit = (item: unknown, depth: number): void => {
    if (++nodes > 65536 || depth > 64) throw rejected(boundary, "serialization work exceeds 65536 values or 64 levels")
    if (Predicate.isString(item)) remaining -= item.length + 2
    else if (Predicate.isObjectOrArray(item)) {
      if (ancestors.has(item)) throw rejected(boundary, "cyclic values cannot be persisted")
      ancestors.add(item)
      remaining -= 2
      if (Array.isArray(item)) {
        for (const child of item) {
          remaining -= 1
          visit(child, depth + 1)
        }
      } else {
        for (const key in item) {
          if (!Object.hasOwn(item, key)) continue
          remaining -= key.length + 4
          visit(item[key], depth + 1)
        }
      }
      ancestors.delete(item)
    } else remaining -= 1
    if (remaining < 0) throw rejected(boundary, `input exceeds ${limit} bytes`)
  }
  visit(value, 0)
}

/** Count UTF-8 without allocating another buffer proportional to a serialized payload. */
export const checkJson = ({
  text,
  boundary,
  limit = maximumBytes,
}: {
  readonly text: string
  readonly boundary: string
  readonly limit?: number
}): string => {
  let bytes = 0
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (
      code >= 0xd800 &&
      code <= 0xdbff &&
      index + 1 < text.length &&
      text.charCodeAt(index + 1) >= 0xdc00 &&
      text.charCodeAt(index + 1) <= 0xdfff
    ) {
      bytes += 4
      index++
    } else bytes += 3
    if (bytes > limit) throw rejected(boundary, `JSON exceeds ${limit} bytes`)
  }
  return text
}

/** @internal Bound codec work and its exact output before storage admission. */
export const encode = <A>({
  value,
  boundary,
  serialize,
  limit = maximumBytes,
}: {
  readonly value: A
  readonly boundary: string
  readonly serialize: (value: A) => string
  readonly limit?: number
}) =>
  Effect.try({
    try: () => {
      checkInput(value, boundary, limit)
      return checkJson({ text: serialize(value), boundary, limit })
    },
    catch: (error) =>
      Schema.is(PayloadTooLarge)(error) ? error : rejected(boundary, "payload could not be inspected"),
  })

/** @internal Validate one admission without changing any value or replacing replay-critical data. */
export const validate = <A>(input: { readonly value: A; readonly boundary: string; readonly limit?: number }) =>
  encode({ ...input, serialize: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown)) }).pipe(Effect.asVoid)
