import { Effect, Function, Schema } from "effect"

export const Address = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand("Address"))
export type Address = typeof Address.Type

export const make = (value: string): Address => Schema.decodeSync(Address)(value)

export const encode: {
  (input: Address, options?: import("effect/SchemaAST").ParseOptions): Effect.Effect<string, Schema.SchemaError>
  (options?: import("effect/SchemaAST").ParseOptions): (input: Address) => Effect.Effect<string, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(Address)(args[0]),
  (input: Address, options?: import("effect/SchemaAST").ParseOptions) => Schema.encodeEffect(Address)(input, options),
)

export const decode: {
  (input: string, options?: import("effect/SchemaAST").ParseOptions): Effect.Effect<Address, Schema.SchemaError>
  (options?: import("effect/SchemaAST").ParseOptions): (input: string) => Effect.Effect<Address, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(Schema.String)(args[0]),
  (input: string, options?: import("effect/SchemaAST").ParseOptions) => Schema.decodeEffect(Address)(input, options),
)
