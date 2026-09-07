import { Effect, Predicate, Record, Schema, SchemaIssue } from "effect"
import { freeze, isImmutable, type Patch, type State } from "../protocol.js"
import { make as makeSchemaCache, ownership, type DataSchema } from "./cache.js"
import { fields as stateFields, type CanonicalState } from "./schema.js"
import { make as makeTable } from "./table.js"
import { normalize, restore, Value } from "./value.js"

const Envelope = Schema.Struct({ version: Schema.Literal(1), data: Value })
const strict = { onExcessProperty: "error" } as const
type Diff = (previous: State, next: State) => ReadonlyArray<Patch>
const object = (value: Schema.Json): value is State => Predicate.isObject(value) && !Array.isArray(value)

export const make = ({ originals, diff }: { readonly originals: WeakMap<object, object>; readonly diff: Diff }) => {
  const metadata = new WeakMap<Schema.Constraint, ReturnType<typeof makeTable<DataSchema>>>()
  const owned = ownership()
  const fields = stateFields({
    reuse: makeSchemaCache(owned),
    table: (row) => {
      const table = makeTable({ row, originals, diff, owned })
      metadata.set(table.schema, table)
      return table.schema
    },
  })
  const schema: Schema.Codec<CanonicalState, unknown> = Schema.Struct(fields)
  const storedFields = Schema.Struct(Record.map(fields, () => Schema.Unknown))
  const tables = new Map(
    Object.entries(fields).flatMap(([key, field]) => {
      const table = metadata.get(field)
      return table === undefined ? [] : [[key, table] as const]
    }),
  )
  let source: State | undefined
  let current: CanonicalState | undefined
  let currentFields: Readonly<Record<string, Value>> | undefined
  let stagedSource: State | undefined
  let staged: CanonicalState | undefined
  let stagedFields: Readonly<Record<string, Value>> | undefined
  return {
    decode: (persisted: State) =>
      Effect.gen(function* () {
        if (persisted === source && isImmutable(persisted)) return current!
        const envelope = yield* Schema.decodeUnknownEffect(Envelope)(persisted, strict)
        if (!Predicate.isObject(envelope.data) || envelope.data.type !== "object")
          return yield* Effect.fail(new SchemaIssue.InvalidValue({ message: "Runtime state must be an object" }))
        let state: CanonicalState
        if (current === undefined) {
          const decoded: Record<string, ReturnType<typeof restore> | Value> = {}
          for (const [key, value] of Object.entries(envelope.data.fields)) {
            const item = tables.has(key) ? value : yield* Effect.try(() => restore(value))
            Object.defineProperty(decoded, key, { value: item, enumerable: true })
          }
          state = yield* Schema.decodeEffect(schema)(decoded, strict)
        } else {
          yield* Schema.decodeUnknownEffect(storedFields)(envelope.data.fields, strict)
          state = { ...current }
          for (const key of Record.keys(fields)) {
            const value = envelope.data.fields[key]!
            if (Object.is(value, currentFields?.[key]) && (!Predicate.isObject(value) || isImmutable(value))) continue
            const item = tables.has(key) ? value : yield* Effect.try(() => restore(value))
            Reflect.set(state, key, yield* Schema.decodeEffect(fields[key])(item, strict))
          }
        }
        stagedSource = persisted
        staged = state
        stagedFields = envelope.data.fields
        return state
      }),
    accept: () => {
      if (staged !== undefined) {
        source = stagedSource
        current = staged
        currentFields = stagedFields
        for (const table of tables.values()) table.accept()
      }
      staged = undefined
      stagedSource = undefined
      stagedFields = undefined
    },
    encode: (state: CanonicalState, persisted: State) =>
      Effect.gen(function* () {
        if (current === undefined)
          return yield* Effect.fail(new SchemaIssue.InvalidValue({ message: "Missing validated Runtime state" }))
        for (const table of tables.values()) table.begin()
        const data = persisted.data
        if (data === undefined || !object(data) || data.fields === undefined || !object(data.fields))
          return yield* Effect.fail(new SchemaIssue.InvalidValue({ message: "Missing canonical Runtime state fields" }))
        const previous = data.fields
        const patches: Array<Patch> = []
        const candidates = { ...current }
        for (const key of Record.keys(fields)) {
          if (Object.is(current[key], state[key])) continue
          const encoded = yield* Schema.encodeUnknownEffect(fields[key])(state[key])
          const table = tables.get(key)
          if (table !== undefined) {
            patches.push(...table.patches(["data", "fields", key]))
          } else
            for (const patch of diff({ value: previous[key]! }, { value: freeze(normalize(encoded)) })) {
              patches.push({ ...patch, path: ["data", "fields", key, ...patch.path.slice(1)] })
            }
          const decoded = yield* Schema.decodeEffect(fields[key])(
            table === undefined ? encoded : table.candidate(),
            strict,
          )
          Reflect.set(candidates, key, decoded)
        }
        return { patches, state: candidates }
      }),
  }
}
