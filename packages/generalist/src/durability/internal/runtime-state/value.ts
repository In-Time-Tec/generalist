import { DateTime, Schema } from "effect"

/** Containers never use JSON arrays: journal paths can update one item without rewriting history. */
export type Value =
  | null | boolean | string | number
  | { readonly type: "undefined" }
  | { readonly type: "bigint"; readonly value: string }
  | { readonly type: "number"; readonly value: "-0" | "NaN" | "Infinity" | "-Infinity" }
  | { readonly type: "bytes" | "date" | "utc" | "zoned"; readonly value: string }
  | { readonly type: "object"; readonly fields: Readonly<Record<string, Value>> }
  | { readonly type: "array"; readonly length: number; readonly items: Readonly<Record<string, Value>> }
  | {
      readonly type: "map"
      readonly length: number
      readonly order: Readonly<Record<string, string>>
      readonly entries: Readonly<Record<string, Value>>
    }

const Index = Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/))
const Length = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0xffffffff))
export const Value: Schema.Codec<Value> = Schema.suspend(() => Schema.Union([
  Schema.Null,
  Schema.Boolean,
  Schema.String,
  Schema.Finite,
  Schema.Struct({ type: Schema.Literal("undefined") }),
  Schema.Struct({ type: Schema.Literal("bigint"), value: Schema.String.check(Schema.isPattern(/^(0|-?[1-9][0-9]*)$/)) }),
  Schema.Struct({ type: Schema.Literal("number"), value: Schema.Literals(["-0", "NaN", "Infinity", "-Infinity"]) }),
  Schema.Struct({ type: Schema.Literals(["bytes", "date", "utc", "zoned"]), value: Schema.String }),
  Schema.Struct({ type: Schema.Literal("object"), fields: Schema.Record(Schema.String, Value) }),
  Schema.Struct({ type: Schema.Literal("array"), length: Length, items: Schema.Record(Index, Value) }),
  Schema.Struct({
    type: Schema.Literal("map"),
    length: Length,
    order: Schema.Record(Index, Schema.String),
    entries: Schema.Record(Schema.String, Value),
  }),
]))

const own = <A>(record: Record<string, A>, key: string, value: A): void => {
  Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true })
}

/** Unknown values are lossless supported data, never JSON.stringify's silently dropped callbacks. */
export const normalize = (input: unknown, ancestors = new Set<object>()): Value => {
  if (input === undefined) return { type: "undefined" }
  if (input === null || typeof input === "boolean" || typeof input === "string") return input
  if (typeof input === "bigint") return { type: "bigint", value: input.toString() }
  if (typeof input === "number") {
    if (Object.is(input, -0)) return { type: "number", value: "-0" }
    if (Number.isNaN(input)) return { type: "number", value: "NaN" }
    if (input === Infinity) return { type: "number", value: "Infinity" }
    if (input === -Infinity) return { type: "number", value: "-Infinity" }
    return input
  }
  if (typeof input !== "object") throw new Error(`Unencodable ${typeof input}: canonical data cannot contain executable callbacks or symbols`)
  if (ancestors.has(input)) throw new Error("Unencodable cyclic canonical data")
  if (input instanceof Uint8Array) return { type: "bytes", value: Schema.encodeSync(Schema.Uint8ArrayFromBase64)(input) }
  if (input instanceof Date) return { type: "date", value: Schema.encodeSync(Schema.DateFromString)(input) }
  if (DateTime.isDateTime(input)) {
    return DateTime.isUtc(input)
      ? { type: "utc", value: Schema.encodeSync(Schema.DateTimeUtcFromString)(input) }
      : { type: "zoned", value: Schema.encodeSync(Schema.DateTimeZonedFromString)(input) }
  }
  ancestors.add(input)
  let location: string | number | undefined
  try {
    if (Array.isArray(input)) {
      const items: Record<string, Value> = {}
      for (let i = 0; i < input.length; i++) {
        location = i
        if (!Object.hasOwn(input, i)) throw new Error("Unencodable sparse array")
        own(items, String(i), normalize(input[i], ancestors))
      }
      if (Object.keys(input).length !== input.length || Object.getOwnPropertySymbols(input).length !== 0) {
        throw new Error("Unencodable array properties")
      }
      return { type: "array", length: input.length, items }
    }
    if (input instanceof Map) {
      const entries: Record<string, Value> = {}
      const order: Record<string, string> = {}
      let index = 0
      for (const [key, value] of input) {
        location = "map value"
        const encodedKey = typeof key === "string" ? `s:${key}`
          : typeof key === "number" && Number.isSafeInteger(key) ? `n:${key}`
          : undefined
        if (encodedKey === undefined) throw new Error("Canonical map keys must be strings or safe integers")
        own(entries, encodedKey, normalize(value, ancestors))
        own(order, String(index++), encodedKey)
      }
      return { type: "map", length: input.size, order, entries }
    }
    const prototype: unknown = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) throw new Error("Unencodable class instance; use its domain Schema before persistence")
    if (Object.getOwnPropertySymbols(input).length !== 0) throw new Error("Unencodable symbol-keyed canonical data")
    const fields: Record<string, Value> = {}
    for (const key of Object.getOwnPropertyNames(input)) {
      location = key
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!
      if (!descriptor.enumerable || !("value" in descriptor)) throw new Error("Unencodable accessor or non-enumerable canonical property")
      own(fields, key, normalize(descriptor.value, ancestors))
    }
    return { type: "object", fields }
  } catch (error) {
    if (location === undefined || !(error instanceof Error)) throw error
    throw new Error(`${error.message} at ${JSON.stringify(String(location).slice(0, 128))}`)
  } finally {
    ancestors.delete(input)
  }
}

const indexed = <A>(items: Readonly<Record<string, A>>, length: number): Array<A> => {
  if (Object.keys(items).length !== length) throw new Error("Canonical sequence length does not match its items")
  const result: Array<A> = []
  for (let i = 0; i < length; i++) {
    if (!Object.hasOwn(items, String(i))) throw new Error("Canonical sequence has a missing or noncanonical index")
    result.push(items[String(i)]!)
  }
  return result
}

/** Called only after the recursive Value Schema validates the persisted boundary. */
export const restore = (input: Value): unknown => {
  if (input === null || typeof input !== "object") return input
  switch (input.type) {
    case "undefined": return undefined
    case "bigint": return BigInt(input.value)
    case "number": return Number(input.value)
    case "bytes": return Schema.decodeUnknownSync(Schema.Uint8ArrayFromBase64)(input.value)
    case "date": return Schema.decodeUnknownSync(Schema.DateFromString)(input.value)
    case "utc": return Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(input.value)
    case "zoned": return Schema.decodeUnknownSync(Schema.DateTimeZonedFromString)(input.value)
    case "object": {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(input.fields)) own(result, key, restore(value))
      return result
    }
    case "array": return indexed(input.items, input.length).map(restore)
    case "map": {
      if (Object.keys(input.entries).length !== input.length) throw new Error("Canonical map length does not match its entries")
      const result = new Map<string | number, unknown>()
      const seen = new Set<string>()
      for (const key of indexed(input.order, input.length)) {
        if (seen.has(key) || !Object.hasOwn(input.entries, key)) throw new Error("Canonical map order has duplicate or missing entries")
        seen.add(key)
        let decodedKey: string | number
        if (key.startsWith("s:")) decodedKey = key.slice(2)
        else if (/^n:(0|-?[1-9][0-9]*)$/.test(key) && Number.isSafeInteger(Number(key.slice(2)))) decodedKey = Number(key.slice(2))
        else throw new Error("Invalid canonical map key")
        result.set(decodedKey, restore(input.entries[key]!))
      }
      return result
    }
  }
}
