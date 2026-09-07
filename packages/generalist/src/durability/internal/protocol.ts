import { Effect, Schema } from "effect"
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

export const failure = (reason: DurabilityFailure["reason"], message: string, key?: string, commandId?: string) =>
  new DurabilityFailure({ reason, message, ...(key === undefined ? {} : { key }), ...(commandId === undefined ? {} : { commandId }) })

/** Catch parser/encoder exceptions at the untrusted boundary, including cyclic values. */
export const decode = <S extends Schema.Constraint & { readonly DecodingServices: never }>(
  schema: S,
  value: unknown,
  reason: DurabilityFailure["reason"],
  key?: string,
): Effect.Effect<S["Type"], DurabilityFailure> =>
  Effect.try({
    try: () => Schema.decodeUnknownSync(schema, { onExcessProperty: "error" })(value),
    catch: (cause) => failure(reason, `Invalid canonical data: ${String(cause)}`, key),
  })

const encoder = new TextEncoder()
const decoder = new TextDecoder("utf-8", { fatal: true })
export const bytes = (value: Json): Effect.Effect<Uint8Array, DurabilityFailure> =>
  Effect.try({
    try: () => encoder.encode(JSON.stringify(canonicalize(value))),
    catch: (cause) => failure("encoding", `Cannot encode canonical JSON: ${String(cause)}`),
  })
export const parse = (value: Uint8Array, key?: string): Effect.Effect<unknown, DurabilityFailure> =>
  Effect.try({
    try: () => JSON.parse(decoder.decode(value)),
    catch: (cause) => failure("corruption", `Invalid UTF-8 JSON: ${String(cause)}`, key),
  })
export const equalBytes = (left: Uint8Array, right: Uint8Array): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

/** Decimal sequences never pass through a JavaScript number. */
export const nextSequence = (sequence: string): string => (BigInt(sequence) + 1n).toString()
export const sequenceName = (sequence: string): string => sequence.padStart(20, "0")
export const compareSequence = (left: string, right: string): number =>
  BigInt(left) < BigInt(right) ? -1 : BigInt(left) > BigInt(right) ? 1 : 0
export const sequenceFromName = (name: string): string | undefined => {
  if (!/^[0-9]{20,}$/.test(name)) return undefined
  const sequence = BigInt(name).toString()
  return sequenceName(sequence) === name ? sequence : undefined
}

export const freeze = <A extends Json>(value: A): A => {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}
const isObject = (value: Json | undefined): value is State =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/** Object-only paths avoid index-shift ambiguity. Dangerous property names remain ordinary own keys. */
export const apply = (state: State, patches: ReadonlyArray<Patch>, reason: "encoding" | "corruption") =>
  Effect.try({
    try: () => {
      if (patches.length === 0) return state
      const root: Record<string, Json> = { ...state }
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
            Object.defineProperty(target, segment, { value: copy, enumerable: true, configurable: true, writable: true })
            target = copy
          }
        }
        const key = patch.path[patch.path.length - 1]!
        if (patch.op === "set") {
          Object.defineProperty(target, key, { value: patch.value, enumerable: true, configurable: true, writable: true })
        } else {
          if (!Object.hasOwn(target, key)) throw new Error("Cannot remove a missing property")
          delete target[key]
        }
      }
      return freeze(root)
    },
    catch: (cause) => failure(reason, `Invalid transition: ${String(cause)}`),
  })
