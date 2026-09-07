import { Array as Arr, Effect, Function, Predicate, Schema } from "effect"
import { canonicalize } from "../../core/durable/canonical-json.js"
import { DurabilityFailure } from "../errors.js"

export type Json = Schema.Json
export type State = Readonly<Record<string, Json>>
export const Patch = Schema.Union([
  Schema.Struct({ op: Schema.Literal("set"), path: Schema.Array(Schema.String), value: Schema.Json }),
  Schema.Struct({ op: Schema.Literal("remove"), path: Schema.Array(Schema.String) }),
])
export type Patch = typeof Patch.Type

const Sequence = Schema.String.check(Schema.isPattern(/^(0|[1-9][0-9]*)$/))
const Digest = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/))
const Identity = {
  version: Schema.Literal(1),
  environment: Schema.String,
  tenant: Schema.String,
  partition: Schema.String,
  sequence: Sequence,
}
export const Commit = Schema.Struct({
  ...Identity,
  kind: Schema.Literal("commit"),
  parentDigest: Schema.Union([Schema.Literal(""), Digest]),
  command: Schema.Struct({ id: Schema.String, inputDigest: Digest }),
  patches: Schema.Array(Patch),
  receipt: Schema.Json,
})
export type Commit = typeof Commit.Type
export const Receipt = Schema.Struct({ inputDigest: Digest, sequence: Sequence, receipt: Schema.Json })
export type Receipt = typeof Receipt.Type
export const Snapshot = Schema.Struct({
  ...Identity,
  kind: Schema.Literal("snapshot"),
  commitDigest: Digest,
  state: Schema.JsonObject,
  receipts: Schema.Record(Schema.String, Receipt),
})
export type Snapshot = typeof Snapshot.Type
export const Envelope = Schema.Struct({ digest: Digest, record: Schema.JsonObject })
export const Command = Schema.Struct({ id: Schema.String.check(Schema.isNonEmpty()), input: Schema.Json })
export const Transition = Schema.Struct({ patches: Schema.Array(Patch), receipt: Schema.Json })
export const Page = Schema.Struct({ keys: Schema.Array(Schema.String), cursor: Schema.optionalKey(Schema.String) })

interface FailureOptions {
  readonly reason: DurabilityFailure["reason"]
  readonly message: string
  readonly key?: string | undefined
  readonly commandId?: string | undefined
}

export const failure = ({ reason, message, key, commandId }: FailureOptions): DurabilityFailure => {
  const fields = { reason, message }
  if (key !== undefined) Object.assign(fields, { key })
  if (commandId !== undefined) Object.assign(fields, { commandId })
  return DurabilityFailure.make(fields)
}

/** Catch parser/encoder exceptions at the untrusted boundary, including cyclic values. */
export const decode = Function.dual<
  <Input>(
    value: Input,
    reason: DurabilityFailure["reason"],
    key?: string,
  ) => <S extends Schema.Constraint & { readonly DecodingServices: never }>(
    schema: S,
  ) => Effect.Effect<S["Type"], DurabilityFailure>,
  <S extends Schema.Constraint & { readonly DecodingServices: never }, Input>(
    schema: S,
    value: Input,
    reason: DurabilityFailure["reason"],
    key?: string,
  ) => Effect.Effect<S["Type"], DurabilityFailure>
>(
  (args) => Schema.isSchema(args[0]),
  <S extends Schema.Constraint & { readonly DecodingServices: never }, Input>(
    schema: S,
    value: Input,
    reason: DurabilityFailure["reason"],
    key?: string,
  ): Effect.Effect<S["Type"], DurabilityFailure> =>
    Schema.decodeUnknownEffect(schema)(value, { onExcessProperty: "error" }).pipe(
      Effect.mapError((cause) => failure({ reason, message: `Invalid canonical data: ${String(cause)}`, key })),
    ),
)

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
export const bytes = (value: Json): Effect.Effect<Uint8Array, DurabilityFailure> =>
  Effect.try({
    try: () => encoder.encode(encodeJson(canonicalize(value))),
    catch: (cause) => failure({ reason: "encoding", message: `Cannot encode canonical JSON: ${String(cause)}` }),
  })
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))
const frozenValues = new WeakSet<object>()
export const isImmutable = <Input>(value: Input): boolean =>
  !Predicate.isObjectOrArray(value) || frozenValues.has(value)
const byteLengths = new WeakMap<object, number>()
const measure = (value: Json): number => {
  if (Predicate.isString(value)) return encoder.encode(JSON.stringify(value)).byteLength
  if (!isContainer(value) || !frozenValues.has(value)) return encoder.encode(encodeJson(value)).byteLength
  const cached = byteLengths.get(value)
  if (cached !== undefined) return cached
  let size = 2
  if (Arr.isArray<Json>(value)) {
    for (let index = 0; index < value.length; index++) size += measure(value[index]!) + Number(index > 0)
  } else {
    const prototype: unknown = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return encoder.encode(encodeJson(value)).byteLength
    const entries = Object.entries(value)
    for (let index = 0; index < entries.length; index++) {
      const [key, child] = entries[index]!
      size += encoder.encode(JSON.stringify(key)).byteLength + 1 + measure(child) + Number(index > 0)
    }
  }
  byteLengths.set(value, size)
  return size
}
export const byteLength = (value: Json): Effect.Effect<number, DurabilityFailure> =>
  Effect.try({
    try: () => measure(value),
    catch: (cause) => failure({ reason: "encoding", message: `Cannot encode JSON: ${String(cause)}` }),
  })
const decodeJson = Schema.decodeSync(Schema.fromJsonString(Schema.Json))
export const parse = Function.dual<
  (key?: string) => (value: Uint8Array) => Effect.Effect<Schema.Json, DurabilityFailure>,
  (value: Uint8Array, key?: string) => Effect.Effect<Schema.Json, DurabilityFailure>
>(
  (args) => args[0] instanceof Uint8Array,
  (value: Uint8Array, key?: string): Effect.Effect<Schema.Json, DurabilityFailure> =>
    Effect.try({
      try: () => decodeJson(decoder.decode(value)),
      catch: (cause) => failure({ reason: "corruption", message: `Invalid UTF-8 JSON: ${String(cause)}`, key }),
    }),
)
export const equalBytes = Function.dual<
  (right: Uint8Array) => (left: Uint8Array) => boolean,
  (left: Uint8Array, right: Uint8Array) => boolean
>(2, (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false
  let index = 0
  if (left.length >= 4 && left.byteOffset % 4 === 0 && right.byteOffset % 4 === 0) {
    const length = Math.floor(left.length / 4)
    const leftWords = new Uint32Array(left.buffer, left.byteOffset, length)
    const rightWords = new Uint32Array(right.buffer, right.byteOffset, length)
    for (let word = 0; word < length; word++) {
      if (leftWords[word] !== rightWords[word]) return false
    }
    index = length * 4
  } else if (left.length >= 4) {
    const leftWords = new DataView(left.buffer, left.byteOffset, left.byteLength)
    const rightWords = new DataView(right.buffer, right.byteOffset, right.byteLength)
    const end = left.length - (left.length % 4)
    for (; index < end; index += 4) {
      if (leftWords.getUint32(index) !== rightWords.getUint32(index)) return false
    }
  }
  for (; index < left.length; index++) {
    if (left[index] !== right[index]) return false
  }
  return true
})

/** Decimal sequences never pass through a JavaScript number. */
export const nextSequence = (sequence: string): string => (BigInt(sequence) + 1n).toString()
export const sequenceName = (sequence: string): string => sequence.padStart(20, "0")
export const compareSequence = Function.dual<
  (right: string) => (left: string) => number,
  (left: string, right: string) => number
>(2, (left: string, right: string): number => {
  if (BigInt(left) < BigInt(right)) return -1
  return BigInt(left) > BigInt(right) ? 1 : 0
})
export const sequenceFromName = (name: string): string | undefined => {
  if (!/^[0-9]{20,}$/.test(name)) return undefined
  const sequence = BigInt(name).toString()
  return sequenceName(sequence) === name ? sequence : undefined
}

export const freeze = <A extends Json>(value: A): A => {
  freezeChildren(value)
  return value
}
const freezeChildren = <Input>(value: Input): boolean => {
  if (!Predicate.isObjectOrArray(value)) return true
  if (frozenValues.has(value)) return true
  const prototype: unknown = Object.getPrototypeOf(value)
  let immutable = Array.isArray(value) || prototype === Object.prototype || prototype === null
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!
    if ("value" in descriptor) {
      const child: unknown = descriptor.value
      immutable = freezeChildren(child) && immutable
    } else immutable = false
  }
  Object.freeze(value)
  if (immutable) frozenValues.add(value)
  return immutable
}
const isContainer = (value: Json): value is State | ReadonlyArray<Json> => Predicate.isObjectOrArray(value)
const isObject = (value: Json | undefined): value is State => Predicate.isObject(value) && !Array.isArray(value)

/** Object-only paths avoid index-shift ambiguity. Dangerous property names remain ordinary own keys. */
export const apply = Function.dual<
  (
    patches: ReadonlyArray<Patch>,
    reason: "encoding" | "corruption",
  ) => (state: State) => Effect.Effect<State, DurabilityFailure>,
  (
    state: State,
    patches: ReadonlyArray<Patch>,
    reason: "encoding" | "corruption",
  ) => Effect.Effect<State, DurabilityFailure>
>(3, (state: State, patches: ReadonlyArray<Patch>, reason: "encoding" | "corruption") =>
  Effect.try({
    try: () => {
      if (patches.length === 0) return state
      const root = { ...state }
      const writable = new WeakSet<object>([root])
      for (const patch of patches) {
        if (patch.path.length === 0) throw new Error("A patch must name an object property")
        let target = root
        for (let index = 0; index < patch.path.length - 1; index += 1) {
          const segment = patch.path[index]!
          const child = Object.hasOwn(target, segment) ? target[segment] : undefined
          if (!isObject(child)) throw new Error("Patch paths cannot traverse arrays, scalars, or missing properties")
          if (writable.has(child)) {
            target = child
          } else {
            const copy = { ...child }
            writable.add(copy)
            Object.defineProperty(target, segment, {
              value: copy,
              enumerable: true,
              configurable: true,
              writable: true,
            })
            target = copy
          }
        }
        const key = patch.path[patch.path.length - 1]!
        if (patch.op === "set") {
          Object.defineProperty(target, key, {
            value: patch.value,
            enumerable: true,
            configurable: true,
            writable: true,
          })
        } else {
          if (!Object.hasOwn(target, key)) throw new Error("Cannot remove a missing property")
          Reflect.deleteProperty(target, key)
        }
      }
      return freeze(root)
    },
    catch: (cause) => failure({ reason, message: `Invalid transition: ${String(cause)}` }),
  }),
)
