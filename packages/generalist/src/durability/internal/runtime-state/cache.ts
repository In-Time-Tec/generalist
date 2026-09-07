import { Effect, Predicate, Schema, SchemaAST, SchemaParser } from "effect"

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
    const output = new Map<K, B>()
    const entries = previous?.entries()
    let unchanged = previous?.size === input.size
    for (const [key, item] of input) {
      const value = f(item, key)
      output.set(key, value)
      if (unchanged) {
        const entry = entries!.next().value!
        unchanged = entry[0] === key && entry[1] === value
      }
    }
    previousInput = input
    previousDependency = dependency
    if (unchanged) return previous!
    previous = output
    return output
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
            Effect.map((value) => {
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
  const records = new WeakMap<
    object,
    {
      readonly template: object
      readonly nullPrototype: boolean
      readonly mutable: ReadonlyArray<readonly [string, unknown]>
    }
  >()
  const retain = <Input extends object, A extends object>(input: Input, value: A): A => {
    if (Object.values(value).every((child) => !Predicate.isObjectOrArray(child) || shareable.has(child))) {
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
      if (value instanceof Date) return structuredClone(value)
      if (value instanceof Uint8Array) return value.slice()
      if (value instanceof Map) {
        const result = new Map<unknown, unknown>()
        copies.set(value, result)
        for (const [key, item] of value) result.set(copy(key), copy(item))
        return result
      }
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
