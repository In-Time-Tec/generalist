import { Predicate, Schema } from "effect"
import type { Prompt } from "effect/unstable/ai"
import { sha256Text } from "../durable/canonical-json.js"

type Identity = null | boolean | number | string | ReadonlyArray<Identity> | { readonly [key: string]: Identity }

type IdentitySource = typeof Schema.Unknown.Type
const normalizeNumber = (value: number): Identity => (Number.isFinite(value) ? value : { $number: String(value) })

const normalize = (value: IdentitySource, seen: Set<object>): Identity => {
  if (value === null || Predicate.isBoolean(value)) return value
  if (Predicate.isString(value)) return value
  if (Predicate.isNumber(value)) return normalizeNumber(value)
  if (Predicate.isBigInt(value)) return { $bigint: value.toString() }
  if (Predicate.isUndefined(value)) return { $undefined: "" }
  if (Predicate.isSymbol(value)) return { $symbol: value.description ?? "" }
  if (Predicate.isFunction(value)) return { $function: value.name }
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
      .filter((key) => key !== "generalist/suspension" && Object.prototype.propertyIsEnumerable.call(value, key))
      .flatMap((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)
        if (descriptor === undefined) return []
        const name = Predicate.isSymbol(key) ? `$symbol:${key.description ?? ""}` : key
        return [[name, descriptor] as const]
      })
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
