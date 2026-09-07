import { Effect, Predicate, Schema, SchemaAST, SchemaIssue, SchemaParser } from "effect"
import { apply, freeze, isImmutable, type Patch, type State } from "../protocol.js"
import { ownership, type DataSchema } from "./cache.js"
import { make as makeValues, Value } from "./value.js"

type Wire = Extract<Value, { readonly type: "map" }>
type Diff = (previous: State, next: State) => ReadonlyArray<Patch>
type Row<A> = { readonly wire: Value; readonly value: A }
type Generation<A> = {
  readonly wire: Wire
  readonly rows: ReadonlyMap<string, Row<A>>
  readonly value: ReadonlyMap<string, A>
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

const orderedEntries = <A>(previous: Wire | undefined, rows: ReadonlyMap<string, Row<A>>) => {
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
}

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
  const decodeStoredRow = (item: Value) =>
    Effect.gen(function* () {
      const restored = yield* Effect.try({
        try: () => values.restore(item),
        catch: () => invalid("Invalid canonical table value"),
      })
      owned.retain(restored)
      const value = yield* decodeRow(restored, { onExcessProperty: "error" })
      owned.retain(value)
      return { wire: item, value }
    })
  const orderedKey = (wire: Wire, index: number, seen: ReadonlyMap<string, Row<S["Type"]>>) => {
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
          { value: previous.wire },
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
      return { wire, value }
    })
  const decodeTable = (wire: Wire) =>
    Effect.gen(function* () {
      const rows = new Map<string, Row<S["Type"]>>()
      const result = new Map<string, S["Type"]>()
      for (let index = 0; index < wire.length; index++) {
        const key = orderedKey(wire, index, rows)
        if (!Predicate.isString(key)) return yield* Effect.fail(key)
        const item = wire.entries[`s:${key}`]!
        const retained = retainedRow(key, item) ?? (yield* decodeStoredRow(item))
        rows.set(key, retained)
        result.set(key, retained.value)
      }
      staged = { wire, rows, value: result }
      return result
    })
  const decode = <Input>(input: Input) =>
    Effect.gen(function* () {
      if (current !== undefined && input === current.value) return current.value
      if (pending !== undefined && input === pending.value) return pending.value
      const wire = yield* SchemaParser.decodeUnknownEffect(Value)(input, { onExcessProperty: "error" })
      if (!Predicate.isObject(wire) || wire.type !== "map")
        return yield* Effect.fail(invalid("Expected a canonical table"))
      if (current?.wire === wire && isImmutable(wire)) {
        staged = current
        return current.value
      }
      if (Object.keys(wire.entries).length !== wire.length || Object.keys(wire.order).length !== wire.length) {
        return yield* Effect.fail(invalid("Canonical table cardinality does not match its order"))
      }
      return yield* decodeTable(wire)
    })
  const encodeTable = (input: ReadonlyMap<unknown, unknown>) =>
    Effect.gen(function* () {
      const rows = new Map<string, Row<S["Type"]>>()
      const result = new Map<string, S["Type"]>()
      const entries: Record<string, Value> = {}
      let unchanged = input.size === current?.value.size
      for (const [key, source] of input) {
        if (!Predicate.isString(key)) return yield* Effect.fail(invalid("Runtime table keys must be strings"))
        const item = Predicate.isObjectOrArray(source) ? (originals.get(source) ?? source) : source
        const previous = current?.rows.get(key)
        const retained =
          previous !== undefined && Object.is(previous.value, item) ? previous : yield* encodeChangedRow(key, item)
        const encodedKey = `s:${key}`
        entries[encodedKey] = retained.wire
        unchanged = unchanged && retained === previous
        rows.set(key, retained)
        result.set(key, retained.value)
      }
      const order = orderedEntries(current?.wire, rows)
      if (unchanged && order === current?.wire.order) {
        pending = current
        return current.wire
      }
      const wire: Wire = freeze({ type: "map", length: rows.size, order, entries })
      pending = { wire, rows, value: result }
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
