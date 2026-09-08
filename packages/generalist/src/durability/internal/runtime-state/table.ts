import { Effect, Predicate, Schema, SchemaAST, SchemaIssue, SchemaParser } from "effect"
import { apply, freeze, isImmutable, setEntries, type Patch, type State } from "../protocol.js"
import { ownership, hasKeyPrefix, type DataSchema } from "./cache.js"
import { make as makeValues, Order, Value } from "./value.js"

type Wire = Extract<Value, { readonly type: "map" }>
const StoredTable = Schema.Struct({
  type: Schema.Literal("map"),
  length: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(0xffffffff)),
  order: Order,
  entries: Schema.Record(Schema.String, Schema.Unknown),
})
type Diff = (previous: State, next: State) => ReadonlyArray<Patch>
type Row<A> = { readonly source: unknown; readonly wire: Value; readonly value: A }
type Generation<A> = {
  readonly source: unknown
  readonly wire: Wire
  readonly rows: ReadonlyMap<string, Row<A>>
  readonly value: ReadonlyMap<string, A>
}
const matchesRow = <A, Input>(row: Row<A> | undefined, input: Input): row is Row<A> =>
  row !== undefined && isImmutable(input) && (Object.is(row.source, input) || Object.is(row.wire, input))
const copyRows = <A>(source: Generation<A> | undefined) => ({
  rows: new Map<string, Row<A>>(source?.rows),
  result: new Map<string, A>(source?.value),
  entries: { ...source?.wire.entries },
})
const extendsOrder = (before: Wire, after: typeof StoredTable.Type): boolean => {
  if (before.order === after.order) return true
  if (before.length > after.length) return false
  for (let index = 0; index < before.length; index++) {
    if (before.order[String(index)] !== after.order[String(index)]) return false
  }
  return true
}

const invalid = (message: string) => new SchemaIssue.InvalidValue({ message })
const object = (value: Schema.Json): value is State => Predicate.isObject(value) && !Array.isArray(value)
const array = (value: Schema.Json): value is ReadonlyArray<Schema.Json> => Array.isArray(value)
const same = (left: Schema.Json, right: Schema.Json): boolean => {
  if (Object.is(left, right)) return true
  if (array(left) && array(right))
    return left.length === right.length && left.every((item, index) => same(item, right[index]!))
  if (!object(left) || !object(right)) return false
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && same(left[key]!, right[key]!))
  )
}

const orderedEntries = <A>(
  previous: Wire | undefined,
  rows: ReadonlyMap<string, Row<A>>,
  additions: ReadonlyArray<readonly [string, string]> | undefined,
) =>
  Effect.gen(function* () {
    if (previous !== undefined && additions !== undefined)
      return yield* setEntries(previous.order, additions).pipe(
        Effect.mapError(() => invalid("Cannot append canonical table order")),
      )
    let index = 0
    let unchanged = previous !== undefined && previous.length === rows.size && isImmutable(previous.order)
    for (const key of rows.keys()) {
      if (!unchanged || previous!.order[String(index++)] !== `s:${key}`) {
        unchanged = false
        break
      }
    }
    if (unchanged) return previous!.order
    const order: Record<string, string> = {}
    index = 0
    for (const key of rows.keys()) order[String(index++)] = `s:${key}`
    return order
  })

export const make = <S extends DataSchema>({
  row,
  originals,
  diff,
  owned = ownership(),
}: {
  readonly row: S
  readonly originals: WeakMap<object, object>
  readonly diff: Diff
  readonly owned?: ReturnType<typeof ownership>
}) => {
  const values = makeValues(owned)
  const original = <Input>(source: Input) =>
    Predicate.isObjectOrArray(source) ? (originals.get(source) ?? source) : source
  const decodeRow = SchemaParser.decodeUnknownEffect(row)
  const encodeRow = SchemaParser.encodeUnknownEffect(row)
  let current: Generation<S["Type"]> | undefined
  let staged: Generation<S["Type"]> | undefined
  let pending: Generation<S["Type"]> | undefined
  let changed = new Set<string>()
  const retainedRow = (key: string, item: Value): Row<S["Type"]> | undefined => {
    if (!isImmutable(item)) return undefined
    const previous = current?.rows.get(key)
    if (previous?.wire === item) return previous
    const candidate = pending?.rows.get(key)
    return candidate !== undefined && same(item, candidate.wire) ? { ...candidate, wire: item } : undefined
  }
  const decodeStoredRow = <Input>(key: string, source: Input) =>
    Effect.gen(function* () {
      const item = freeze(yield* SchemaParser.decodeUnknownEffect(Value)(source, { onExcessProperty: "error" }))
      const retained = retainedRow(key, item)
      if (retained !== undefined) return { ...retained, source }
      const restored = yield* Effect.try({
        try: () => values.restore(item),
        catch: () => invalid("Invalid canonical table value"),
      })
      owned.retain(restored)
      const value = yield* decodeRow(restored, { onExcessProperty: "error" })
      owned.retain(value)
      return { source, wire: item, value }
    })
  const orderedKey = (wire: typeof StoredTable.Type, index: number, seen: ReadonlyMap<string, Row<S["Type"]>>) => {
    const encoded = wire.order[String(index)]
    if (encoded === undefined || !encoded.startsWith("s:") || !Object.hasOwn(wire.entries, encoded))
      return invalid("Canonical table order has an invalid or missing key")
    const key = encoded.slice(2)
    return seen.has(key) ? invalid("Canonical table order repeats a key") : key
  }
  const encodeChangedRow = <Input>(key: string, item: Input) =>
    Effect.gen(function* () {
      const previous = current?.rows.get(key)
      const encoded = yield* encodeRow(item)
      let wire = yield* Effect.try({
        try: () => freeze(values.normalize(encoded)),
        catch: () => invalid("Cannot normalize Runtime table value"),
      })
      if (previous !== undefined && same(previous.wire, wire)) return previous
      if (previous !== undefined) {
        const patched = yield* apply(
          freeze({ value: previous.wire }),
          diff({ value: previous.wire }, { value: wire }),
          "encoding",
        ).pipe(Effect.mapError(() => invalid("Cannot project changed Runtime row")))
        wire = yield* SchemaParser.decodeUnknownEffect(Value)(freeze(patched.value!), { onExcessProperty: "error" })
      }
      const restored = yield* Effect.try({
        try: () => values.restore(wire),
        catch: () => invalid("Invalid encoded Runtime table value"),
      })
      owned.retain(restored)
      const value = yield* decodeRow(restored, { onExcessProperty: "error" })
      owned.retain(value)
      changed.add(key)
      return { source: wire, wire, value }
    })
  const decodeTable = <Input>(source: Input, wire: typeof StoredTable.Type) =>
    Effect.gen(function* () {
      const base = current !== undefined && extendsOrder(current.wire, wire) ? current : undefined
      const { rows, result, entries } = copyRows(base)
      if (base !== undefined) {
        for (const [key, previous] of base.rows) {
          const encodedKey = `s:${key}`
          if (!Object.hasOwn(wire.entries, encodedKey))
            return yield* Effect.fail(invalid("Canonical table order has an invalid or missing key"))
          const item = wire.entries[encodedKey]
          if (matchesRow(previous, item)) continue
          const retained = yield* decodeStoredRow(key, item)
          entries[encodedKey] = retained.wire
          rows.set(key, retained)
          result.set(key, retained.value)
        }
      }
      for (let index = base === undefined ? 0 : base.rows.size; index < wire.length; index++) {
        const key = orderedKey(wire, index, rows)
        if (!Predicate.isString(key)) return yield* Effect.fail(key)
        const item = wire.entries[`s:${key}`]!
        const previous = current?.rows.get(key)
        const retained = matchesRow(previous, item) ? previous : yield* decodeStoredRow(key, item)
        entries[`s:${key}`] = retained.wire
        rows.set(key, retained)
        result.set(key, retained.value)
      }
      const validated: Wire = Object.freeze({
        ...wire,
        order: freeze(wire.order),
        entries: Object.freeze(entries),
      })
      staged = { source, wire: validated, rows, value: result }
      return result
    })
  const decode = <Input>(input: Input) =>
    Effect.gen(function* () {
      if (current !== undefined && input === current.value) return current.value
      if (pending !== undefined && input === pending.value) return pending.value
      if (current !== undefined && (input === current.source || input === current.wire) && isImmutable(input)) {
        staged = current
        return current.value
      }
      const wire = yield* SchemaParser.decodeUnknownEffect(StoredTable)(input, { onExcessProperty: "error" })
      if (Object.keys(wire.entries).length !== wire.length || Object.keys(wire.order).length !== wire.length) {
        return yield* Effect.fail(invalid("Canonical table cardinality does not match its order"))
      }
      return yield* decodeTable(input, wire)
    })
  const encodeTable = (input: ReadonlyMap<unknown, unknown>) =>
    Effect.gen(function* () {
      const items = new Map(input)
      const base = current !== undefined && hasKeyPrefix(items, current.rows) ? current : undefined
      const { rows, result, entries } = copyRows(base)
      let unchanged = base !== undefined
      const additions: Array<readonly [string, string]> = []
      for (const [key, source] of items) {
        if (!Predicate.isString(key)) return yield* Effect.fail(invalid("Runtime table keys must be strings"))
        const item = original(source)
        const previous = current?.rows.get(key)
        const retained =
          previous !== undefined && Object.is(previous.value, item) ? previous : yield* encodeChangedRow(key, item)
        if (base !== undefined && retained === previous) continue
        const encodedKey = `s:${key}`
        if (previous === undefined) additions.push([String(rows.size), encodedKey])
        entries[encodedKey] = retained.wire
        unchanged = false
        rows.set(key, retained)
        result.set(key, retained.value)
      }
      if (unchanged) {
        pending = base!
        return base!.wire
      }
      const order = yield* orderedEntries(current?.wire, rows, base === undefined ? undefined : additions)
      const wire: Wire = Object.freeze({
        type: "map",
        length: rows.size,
        order: freeze(order),
        entries: Object.freeze(entries),
      })
      pending = { source: wire, wire, rows, value: result }
      return wire
    })
  const encode = <Input>(input: Input) =>
    Effect.gen(function* () {
      if (!(input instanceof Map)) return yield* Effect.fail(invalid("Expected a Runtime table Map"))
      if (input === current?.value) {
        pending = current
        return current.wire
      }
      return yield* encodeTable(input)
    })
  const schema = Schema.make<Schema.Codec<ReadonlyMap<string, S["Type"]>, Value>>(
    new SchemaAST.Declaration(
      [row.ast],
      () => decode,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      () => encode,
    ),
  )
  return {
    schema,
    candidate: () => pending?.value ?? current?.value,
    begin: () => {
      pending = undefined
      staged = undefined
      changed = new Set()
    },
    accept: () => {
      if (staged !== undefined) current = staged
      staged = undefined
      pending = undefined
    },
    patches: (path: ReadonlyArray<string>): ReadonlyArray<Patch> => {
      if (pending === undefined || pending === current) return []
      if (current === undefined) return [{ op: "set", path, value: pending.wire }]
      const patches: Array<Patch> = []
      for (const key of current.rows.keys()) if (!pending.rows.has(key)) changed.add(key)
      for (const key of changed) {
        const old = current.rows.get(key)
        const next = pending.rows.get(key)
        const prefix = [...path, "entries", `s:${key}`]
        if (next === undefined) patches.push({ op: "remove", path: prefix })
        else if (old === undefined) patches.push({ op: "set", path: prefix, value: next.wire })
        else
          for (const patch of diff({ value: old.wire }, { value: next.wire }))
            patches.push({ ...patch, path: [...prefix, ...patch.path.slice(1)] })
      }
      for (const patch of diff(
        { length: current.wire.length, order: current.wire.order },
        { length: pending.wire.length, order: pending.wire.order },
      ))
        patches.push({ ...patch, path: [...path, ...patch.path] })
      return patches
    },
  }
}
