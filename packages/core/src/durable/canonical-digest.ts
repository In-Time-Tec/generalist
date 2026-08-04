import { Option, Schema } from "effect"

const fnv1a = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

const canonicalValue = (value: unknown): unknown => {
  if (Object.prototype.toString.call(value) === "[object URL]") return String(value)
  if (value instanceof Uint8Array) return Array.from(value)
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === "object") {
    const record = Schema.decodeUnknownOption(Schema.Record(Schema.String, Schema.Unknown))(value)
    if (Option.isNone(record)) return value
    return Object.fromEntries(
      Object.entries(record.value)
        .filter(([, item]) => item !== undefined)
        .toSorted(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    )
  }
  return value
}

/** @experimental Stable digest for canonical JSON-serializable values. */
export const of = (value: unknown): string => fnv1a(JSON.stringify(canonicalValue(value)))
