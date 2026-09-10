import { Effect, Function, Predicate, Schema, SchemaAST, SchemaParser } from "effect"

export type DataSchema = Schema.Constraint & { readonly DecodingServices: never; readonly EncodingServices: never }

export type Reuse = <S extends DataSchema>(
  schema: S,
) => Schema.Codec<S["Type"], S["Encoded"], S["DecodingServices"], S["EncodingServices"]>

export const ownership = () => {
  const retained = new WeakSet<object>()
  const retain = <Input>(input: Input): void => {
    if (!Predicate.isObjectOrArray(input) || retained.has(input)) return
    retained.add(input)
    if (input instanceof Map) {
      for (const [key, value] of input) {
        retain(key)
        retain(value)
      }
    } else for (const value of Object.values(input)) retain(value)
  }
  return { has: <Input extends object>(input: Input) => retained.has(input), retain }
}

export const hasKeyPrefix = Function.dual<
  (right: ReadonlyMap<unknown, unknown>) => (left: ReadonlyMap<unknown, unknown>) => boolean,
  (left: ReadonlyMap<unknown, unknown>, right: ReadonlyMap<unknown, unknown>) => boolean
>(2, (left: ReadonlyMap<unknown, unknown>, right: ReadonlyMap<unknown, unknown>): boolean => {
  if (left.size < right.size) return false
  const keys = left.keys()
  for (const key of right.keys()) if (!Object.is(key, keys.next().value)) return false
  return true
})

export const mapValues = <K, A, B extends object>() => {
  let previous: ReadonlyMap<K, B> | undefined
  let previousInput: ReadonlyMap<K, A> | undefined
  let previousDependency: unknown
  return <Dependency>(
    input: ReadonlyMap<K, A>,
    f: (value: A, key: K) => B,
    dependency?: Dependency,
  ): ReadonlyMap<K, B> => {
    if (dependency !== undefined && input === previousInput && dependency === previousDependency) return previous!
    const items = new Map(input)
    const retained = previous !== undefined && hasKeyPrefix(items, previous) ? previous : undefined
    let output = retained === undefined ? new Map<K, B>() : undefined
    for (const [key, item] of items) {
      const value = f(item, key)
      if (retained !== undefined && retained.get(key) === value) continue
      output ??= new Map(retained)
      output.set(key, value)
    }
    previousInput = input
    previousDependency = dependency
    previous = output ?? retained!
    return previous
  }
}

export const make =
  (owned?: ReturnType<typeof ownership>): Reuse =>
  <S extends DataSchema>(schema: S) => {
    const decoding = new WeakMap<SchemaAST.AST, WeakMap<object, unknown>>()
    const encoding = new WeakMap<SchemaAST.AST, WeakMap<object, unknown>>()
    const parser =
      (
        caches: WeakMap<SchemaAST.AST, WeakMap<object, unknown>>,
        onExcessProperty: "error" | undefined,
      ): SchemaAST.DeclarationRun =>
      ([ast]) => {
        const cache = caches.get(ast!) ?? new WeakMap<object, unknown>()
        caches.set(ast!, cache)
        const decode = SchemaParser.decodeUnknownEffect(Schema.make<Schema.Codec<unknown>>(ast!))
        return (input, _self, options) => {
          const cacheable =
            options.onExcessProperty === onExcessProperty &&
            options.disableChecks !== true &&
            options.propertyOrder !== "original"
          const privateInput = Predicate.isObjectOrArray(input) && (owned === undefined || owned.has(input))
          if (cacheable && privateInput && cache.has(input)) {
            return Effect.succeed(cache.get(input))
          }
          return decode(input, options).pipe(
            Effect.mapEager((value) => {
              if (cacheable && privateInput) {
                owned?.retain(value)
                cache.set(input, value)
              }
              return value
            }),
          )
        }
      }
    return Schema.make<Schema.Codec<S["Type"], S["Encoded"], S["DecodingServices"], S["EncodingServices"]>>(
      new SchemaAST.Declaration(
        [schema.ast],
        parser(decoding, "error"),
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        parser(encoding, undefined),
      ),
    )
  }

export const detach = () => {
  const retained = new WeakMap<object, object>()
  const shareable = new WeakSet<object>()
  const maps = new WeakMap<
    object,
    {
      readonly template: ReadonlyMap<unknown, unknown>
      readonly mutable: ReadonlyArray<readonly [unknown, unknown]>
    }
  >()
  const records = new WeakMap<
    object,
    {
      readonly template: object
      readonly nullPrototype: boolean
      readonly mutable: ReadonlyArray<readonly [string, unknown]>
    }
  >()
  const canShare = <Input>(value: Input) => !Predicate.isObjectOrArray(value) || shareable.has(value)
  const retain = <Input extends object, A extends object>(input: Input, value: A): A => {
    if (Object.values(value).every(canShare)) {
      Object.freeze(value)
      shareable.add(value)
      retained.set(input, value)
    }
    return value
  }
  return <A>(input: A): A => {
    const copies = new WeakMap<object, object>()
    function copy<Input>(value: Input): Input
    function copy<Input>(value: Input) {
      if (!Predicate.isObjectOrArray(value)) return value
      if (retained.has(value)) return retained.get(value)
      if (copies.has(value)) return copies.get(value)
      if (value instanceof Date || value instanceof Uint8Array) {
        const result = value instanceof Date ? structuredClone(value) : value.slice()
        copies.set(value, result)
        return result
      }
      if (value instanceof Map) return copyMap(value)
      if (Array.isArray(value)) {
        const result: Array<unknown> = []
        copies.set(value, result)
        for (const item of value) result.push(copy(item))
        return retain(value, result)
      }
      const previous = records.get(value)
      if (previous !== undefined) {
        const result = { ...previous.template }
        if (previous.nullPrototype) Object.setPrototypeOf(result, null)
        copies.set(value, result)
        for (const [key, item] of previous.mutable) Reflect.set(result, key, copy(item))
        return result
      }
      return copyObject(value)
    }
    const copyMap = <Key, Item>(value: ReadonlyMap<Key, Item>) => {
      const previous = maps.get(value)
      if (previous !== undefined) {
        const result = new Map(previous.template)
        copies.set(value, result)
        for (const [key, item] of previous.mutable) result.set(key, copy(item))
        return result
      }
      const result = new Map<unknown, unknown>()
      copies.set(value, result)
      const mutable: Array<readonly [unknown, unknown]> = []
      let immutableKeys = true
      for (const [key, item] of value) {
        const copiedKey = copy(key)
        const copiedItem = copy(item)
        immutableKeys = immutableKeys && canShare(copiedKey)
        result.set(copiedKey, copiedItem)
        if (!canShare(copiedItem)) mutable.push([copiedKey, item])
      }
      if (immutableKeys) {
        const template = new Map(result)
        for (const [key] of mutable) template.set(key, undefined)
        maps.set(value, { template, mutable })
      }
      return result
    }
    const copyObject = <Input extends object>(value: Input) => {
      const prototype: unknown = Object.getPrototypeOf(value)
      if (prototype !== null && !Predicate.isObject(prototype)) throw new Error("Invalid canonical value prototype")
      if (prototype === Object.prototype || prototype === null) {
        const result = { ...value }
        if (prototype === null) Object.setPrototypeOf(result, null)
        copies.set(value, result)
        const mutable: Array<readonly [string, unknown]> = []
        for (const [key, item] of Object.entries(result)) {
          const child: unknown = copy(item)
          Reflect.set(result, key, child)
          if (Predicate.isObjectOrArray(child) && !shareable.has(child)) mutable.push([key, item])
        }
        if (mutable.length === 0) return retain(value, result)
        const template = { ...result }
        for (const [key] of mutable) Reflect.set(template, key, undefined)
        records.set(value, { template: Object.freeze(template), nullPrototype: prototype === null, mutable })
        return result
      }
      const result: unknown = Object.create(prototype)
      if (!Predicate.isObject(result)) throw new Error("Cannot detach a canonical value")
      copies.set(value, result)
      for (const key of Reflect.ownKeys(value)) {
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        Object.defineProperty(
          result,
          key,
          "value" in descriptor ? { ...descriptor, value: copy(descriptor.value) } : descriptor,
        )
      }
      return result
    }
    return copy(input)
  }
}
