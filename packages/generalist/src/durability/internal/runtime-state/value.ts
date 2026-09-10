import { DateTime, Effect, Predicate, Schema, SchemaParser } from "effect"
import { Prompt } from "effect/unstable/ai"
import { FrameworkError } from "./framework-error.js"
import { freeze, isImmutable } from "../protocol.js"
import type { ownership } from "./cache.js"

type NormalizationCache = Pick<WeakMap<object, Value>, "get" | "set">

/** Containers never use JSON arrays: journal paths can update one item without rewriting history. */
export type Value =
  | null
  | boolean
  | string
  | number
  | { readonly type: "undefined" }
  | { readonly type: "bigint"; readonly value: string }
  | { readonly type: "number"; readonly value: "-0" | "NaN" | "Infinity" | "-Infinity" }
  | { readonly type: "bytes" | "date" | "utc" | "zoned"; readonly value: string }
  | { readonly type: "object"; readonly fields: Readonly<Record<string, Value>> }
  | { readonly type: "framework-error"; readonly value: Value }
  | { readonly type: "prompt"; readonly value: Value }
  | { readonly type: "array"; readonly length: number; readonly items: Readonly<Record<string, Value>> }
  | {
      readonly type: "map"
      readonly length: number
      readonly order: Readonly<Record<string, string>>
      readonly entries: Readonly<Record<string, Value>>
    }

const Index = Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/))
const isIndex = Schema.is(Index)
const canonicalIndices = Schema.makeFilter(
  (record: Readonly<Record<string, Schema.Json>>) => Object.keys(record).every(isIndex),
  { message: "Canonical sequences require unpadded non-negative integer keys" },
)
const Length = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0xffffffff))
const StoredValue: Schema.Codec<Value> = Schema.suspend(() =>
  Schema.Union([
    Schema.Null,
    Schema.Boolean,
    Schema.String,
    Schema.Finite,
    Schema.Struct({ type: Schema.Literal("undefined") }),
    Schema.Struct({
      type: Schema.Literal("bigint"),
      value: Schema.String.check(Schema.isPattern(/^(0|-?[1-9][0-9]*)$/)),
    }),
    Schema.Struct({ type: Schema.Literal("number"), value: Schema.Literals(["-0", "NaN", "Infinity", "-Infinity"]) }),
    Schema.Struct({ type: Schema.Literals(["bytes", "date", "utc", "zoned"]), value: Schema.String }),
    Schema.Struct({ type: Schema.Literal("object"), fields: Schema.Record(Schema.String, Value) }),
    Schema.Struct({ type: Schema.Literal("framework-error"), value: Value }),
    Schema.Struct({ type: Schema.Literal("prompt"), value: Value }),
    Schema.Struct({
      type: Schema.Literal("array"),
      length: Length,
      items: Schema.Record(Schema.String, Value).check(canonicalIndices),
    }),
    Schema.Struct({
      type: Schema.Literal("map"),
      length: Length,
      order: Order,
      entries: Schema.Record(Schema.String, Value),
    }),
  ]),
)

const immutableNodes = new WeakSet<object>()
const immutable = <Input>(input: Input): boolean => {
  if (!Predicate.isObjectOrArray(input)) return true
  if (immutableNodes.has(input) || isImmutable(input)) return true
  if (!Object.isFrozen(input)) return false
  const prototype: unknown = Object.getPrototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) return false
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(input))) {
    if (!("value" in descriptor) || !immutable(descriptor.value)) return false
  }
  immutableNodes.add(input)
  return true
}

const immutableCodec = <A extends Schema.Json>(schema: Schema.Codec<A>): Schema.Codec<A> => {
  const validatedNodes = new WeakMap<object, A>()
  return Schema.declareConstructor<A, A>()([schema], ([storedValue]) => {
    const decode = SchemaParser.decodeUnknownEffect(storedValue)
    return (input, _ast, options) => {
      if (!Predicate.isObject(input)) return decode(input, options)
      const cacheable = options?.onExcessProperty === "error" && options.disableChecks !== true
      const cached = cacheable ? validatedNodes.get(input) : undefined
      if (cached !== undefined) return Effect.succeed(cached)
      return decode(input, options).pipe(
        Effect.mapEager((decoded) => {
          if (cacheable && immutable(input)) {
            const retained = freeze(decoded)
            validatedNodes.set(input, retained)
            if (Predicate.isObject(retained)) validatedNodes.set(retained, retained)
            return retained
          }
          return decoded
        }),
      )
    }
  })
}

export const Order = immutableCodec(Schema.Record(Schema.String, Schema.String).check(canonicalIndices))
export const Value: Schema.Codec<Value> = immutableCodec(StoredValue)

const own = <A>(record: Record<string, A>, key: string, value: A): void => {
  Object.defineProperty(record, key, { value, enumerable: true, configurable: true, writable: true })
}

const undefinedValue: Value = freeze({ type: "undefined" })

const normalizeNumber = (input: number): Value => {
  if (Object.is(input, -0)) return { type: "number", value: "-0" }
  if (Number.isNaN(input)) return { type: "number", value: "NaN" }
  if (input === Infinity) return { type: "number", value: "Infinity" }
  if (input === -Infinity) return { type: "number", value: "-Infinity" }
  return input
}

const normalizeArray = <Item>(
  input: ReadonlyArray<Item>,
  ancestors: Set<object>,
  cache?: NormalizationCache,
): Value => {
  const items: Record<string, Value> = {}
  for (let i = 0; i < input.length; i++) {
    if (!Object.hasOwn(input, i)) throw new Error("Unencodable sparse array")
    try {
      own(items, String(i), normalizeValue(input[i], ancestors, cache))
    } catch (cause) {
      throw new Error(`Unencodable array item at ${i}`, { cause })
    }
  }
  if (Object.keys(input).length !== input.length || Object.getOwnPropertySymbols(input).length !== 0) {
    throw new Error("Unencodable array properties")
  }
  return { type: "array", length: input.length, items }
}

const normalizeMap = <Key, Item>(
  input: ReadonlyMap<Key, Item>,
  ancestors: Set<object>,
  cache?: NormalizationCache,
): Value => {
  const entries: Record<string, Value> = {}
  const order: Record<string, string> = {}
  let index = 0
  for (const [key, value] of input) {
    let encodedKey: string
    if (Predicate.isString(key)) encodedKey = `s:${key}`
    else if (Predicate.isNumber(key) && Number.isSafeInteger(key)) encodedKey = `n:${key}`
    else throw new Error("Canonical map keys must be strings or safe integers")
    own(entries, encodedKey, normalizeValue(value, ancestors, cache))
    own(order, String(index++), encodedKey)
  }
  return { type: "map", length: input.size, order, entries }
}

/** Unknown values are lossless supported data, never JSON.stringify's silently dropped callbacks. */
const normalizeValue = <Input>(input: Input, ancestors: Set<object>, cache?: NormalizationCache): Value => {
  if (input === undefined) return undefinedValue
  if (input === null || Predicate.isBoolean(input) || Predicate.isString(input)) return input
  if (Predicate.isBigInt(input)) return { type: "bigint", value: input.toString() }
  if (Predicate.isNumber(input)) return normalizeNumber(input)
  if (!Predicate.isObjectOrArray(input))
    throw new Error("Unencodable canonical data cannot contain executable callbacks or symbols")
  if (ancestors.has(input)) throw new Error("Unencodable cyclic canonical data")
  const cached = cache?.get(input)
  if (cached !== undefined) return cached
  ancestors.add(input)
  try {
    const value = normalizeObject(input, ancestors, cache)
    cache?.set(input, value)
    return value
  } finally {
    ancestors.delete(input)
  }
}

const normalizeObject = <Input extends object>(
  input: Input,
  ancestors: Set<object>,
  cache?: NormalizationCache,
): Value => {
  if (input instanceof Uint8Array)
    return { type: "bytes", value: Schema.encodeSync(Schema.Uint8ArrayFromBase64)(input) }
  if (input instanceof Date) return { type: "date", value: Schema.encodeSync(Schema.DateFromString)(input) }
  if (DateTime.isDateTime(input)) {
    return DateTime.isUtc(input)
      ? { type: "utc", value: Schema.encodeSync(Schema.DateTimeUtcFromString)(input) }
      : { type: "zoned", value: Schema.encodeSync(Schema.DateTimeZonedFromString)(input) }
  }
  return normalizeContainer(input, ancestors, cache)
}

const normalizeContainer = <Input extends object>(
  input: Input,
  ancestors: Set<object>,
  cache?: NormalizationCache,
): Value => {
  let location: string | number | undefined
  try {
    if (Prompt.isPrompt(input)) {
      return { type: "prompt", value: normalizeValue(Schema.encodeSync(Prompt.Prompt)(input), ancestors, cache) }
    }
    if (Array.isArray(input)) return normalizeArray(input, ancestors, cache)
    if (input instanceof Map) return normalizeMap(input, ancestors, cache)
    const prototype: unknown = Object.getPrototypeOf(input)
    if (prototype !== Object.prototype && prototype !== null) {
      if (Schema.is(Schema.Struct({ _tag: Schema.String }))(input) && Object.hasOwn(FrameworkError.cases, input._tag)) {
        return {
          type: "framework-error",
          value: normalizeValue(Schema.encodeUnknownSync(FrameworkError)(input), ancestors, cache),
        }
      }
      throw new Error("Unencodable class instance; use its domain Schema before persistence")
    }
    if (Object.getOwnPropertySymbols(input).length !== 0) throw new Error("Unencodable symbol-keyed canonical data")
    const fields: Record<string, Value> = {}
    for (const key of Object.getOwnPropertyNames(input)) {
      location = key
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!
      if (descriptor.enumerable !== true || !("value" in descriptor))
        throw new Error("Unencodable accessor or non-enumerable canonical property")
      own(fields, key, normalizeValue(descriptor.value, ancestors, cache))
    }
    return { type: "object", fields }
  } catch (error) {
    if (location === undefined || !(error instanceof Error)) throw error
    throw new Error(`${error.message} at ${JSON.stringify(String(location).slice(0, 128))}`, { cause: error })
  }
}

export const normalize = <Input>(input: Input): Value => normalizeValue(input, new Set())

type Restored =
  | null
  | undefined
  | boolean
  | string
  | number
  | bigint
  | Uint8Array
  | Date
  | DateTime.DateTime
  | Prompt.Prompt
  | typeof FrameworkError.Type
  | { readonly [key: string]: Restored }
  | ReadonlyArray<Restored>
  | ReadonlyMap<string | number, Restored>

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
export const restore = (input: Value): Restored => restoreValue(input)

const restoreValue = (input: Value, cache?: WeakMap<object, Restored>): Restored => {
  if (!Predicate.isObjectOrArray(input)) return input
  const cacheable = cache !== undefined && isImmutable(input)
  if (cacheable && cache.has(input)) return cache.get(input)!
  const restored = restoreContainer(input, cache)
  if (cacheable) cache.set(input, restored)
  return restored
}

const restoreContainer = (
  input: Exclude<Value, null | boolean | string | number>,
  cache?: WeakMap<object, Restored>,
): Restored => {
  switch (input.type) {
    case "undefined":
      return undefined
    case "bigint":
      return BigInt(input.value)
    case "number":
      return Number(input.value)
    case "bytes":
      return Schema.decodeSync(Schema.Uint8ArrayFromBase64)(input.value)
    case "date":
      return Schema.decodeSync(Schema.DateFromString)(input.value)
    case "utc":
      return Schema.decodeSync(Schema.DateTimeUtcFromString)(input.value)
    case "zoned":
      return Schema.decodeSync(Schema.DateTimeZonedFromString)(input.value)
    case "framework-error":
      return Schema.decodeUnknownSync(FrameworkError)(restoreValue(input.value, cache))
    case "prompt":
      return Schema.decodeUnknownSync(Prompt.Prompt)(restoreValue(input.value, cache))
    case "object": {
      const result: Record<string, Restored> = {}
      for (const [key, value] of Object.entries(input.fields)) own(result, key, restoreValue(value, cache))
      return result
    }
    case "array":
      return indexed(input.items, input.length).map((value) => restoreValue(value, cache))
    case "map":
      return restoreMap(input, cache)
  }
}

const restoreMap = (
  input: Extract<Value, { readonly type: "map" }>,
  cache?: WeakMap<object, Restored>,
): ReadonlyMap<string | number, Restored> => {
  if (Object.keys(input.entries).length !== input.length)
    throw new Error("Canonical map length does not match its entries")
  const result = new Map<string | number, Restored>()
  const seen = new Set<string>()
  for (const key of indexed(input.order, input.length)) {
    if (seen.has(key) || !Object.hasOwn(input.entries, key))
      throw new Error("Canonical map order has duplicate or missing entries")
    seen.add(key)
    let decodedKey: string | number
    if (key.startsWith("s:")) decodedKey = key.slice(2)
    else if (/^n:(0|-?[1-9][0-9]*)$/.test(key) && Number.isSafeInteger(Number(key.slice(2))))
      decodedKey = Number(key.slice(2))
    else throw new Error("Invalid canonical map key")
    result.set(decodedKey, restoreValue(input.entries[key]!, cache))
  }
  return result
}

export const make = (owned?: ReturnType<typeof ownership>) => {
  const normalized = new WeakMap<object, Value>()
  const restored = new WeakMap<object, Restored>()
  const cache = {
    get: <Input extends object>(input: Input) =>
      owned === undefined || owned.has(input) ? normalized.get(input) : undefined,
    set: <Input extends object>(input: Input, value: Value) =>
      owned === undefined || owned.has(input) ? normalized.set(input, value) : normalized,
  }
  return {
    normalize: <Input>(input: Input): Value => normalizeValue(input, new Set(), cache),
    restore: (input: Value): Restored => restoreValue(input, restored),
  }
}
