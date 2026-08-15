import type { Prompt } from "effect/unstable/ai"
import { sha256Text } from "../durable/canonical-json.js"

type Identity = null | boolean | number | string | ReadonlyArray<Identity> | { readonly [key: string]: Identity }

const normalize = (value: unknown, seen: Set<object>): Identity => {
  if (value === null || typeof value === "boolean" || typeof value === "string") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : { $number: String(value) }
  if (typeof value === "bigint") return { $bigint: value.toString() }
  if (typeof value === "undefined") return { $undefined: "" }
  if (typeof value === "symbol") return { $symbol: String(value.description ?? "") }
  if (typeof value === "function") return { $function: value.name }
  if (seen.has(value)) return { $cycle: "" }
  seen.add(value)
  if (Array.isArray(value)) {
    const normalized = value.map((item) => normalize(item, seen))
    seen.delete(value)
    return normalized
  }
  if (value instanceof Date) {
    seen.delete(value)
    return { $date: value.toISOString() }
  }
  if (value instanceof Map) {
    const normalized = [...value.entries()]
      .map(([key, item]) => [normalize(key, seen), normalize(item, seen)] satisfies ReadonlyArray<Identity>)
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    seen.delete(value)
    return { $map: normalized }
  }
  if (value instanceof Set) {
    const normalized = [...value]
      .map((item) => normalize(item, seen))
      .toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    seen.delete(value)
    return { $set: normalized }
  }
  const properties = Object.fromEntries(
    Reflect.ownKeys(value)
      .filter((key) => key !== "@batonfx/core/suspension" && Object.prototype.propertyIsEnumerable.call(value, key))
      .map(
        (key) =>
          [
            typeof key === "symbol" ? `$symbol:${String(key.description ?? "")}` : key,
            Object.getOwnPropertyDescriptor(value, key)!,
          ] as const,
      )
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([key, descriptor]) => [
        key,
        "value" in descriptor ? normalize(descriptor.value, seen) : ({ $accessor: "" } satisfies Identity),
      ]),
  )
  seen.delete(value)
  return { $properties: properties }
}

export const promptDigest = (messages: ReadonlyArray<Prompt.Message>): string =>
  sha256Text(JSON.stringify(normalize(messages, new Set())))
