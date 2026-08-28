import { Effect, Function, Schema } from "effect"

export const Cursor = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(-1),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
export type Cursor = typeof Cursor.Type

export const origin: Cursor = -1

export const make = (value: number): Cursor => Schema.decodeSync(Cursor)(value)

export const encode: {
  (input: Cursor, options?: import("effect/SchemaAST").ParseOptions): Effect.Effect<number, Schema.SchemaError>
  (options?: import("effect/SchemaAST").ParseOptions): (input: Cursor) => Effect.Effect<number, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(Cursor)(args[0]),
  (input: Cursor, options?: import("effect/SchemaAST").ParseOptions) => Schema.encodeEffect(Cursor)(input, options),
)

export const decode: {
  (input: Cursor, options?: import("effect/SchemaAST").ParseOptions): Effect.Effect<number, Schema.SchemaError>
  (options?: import("effect/SchemaAST").ParseOptions): (input: Cursor) => Effect.Effect<number, Schema.SchemaError>
} = Function.dual(
  (args) => Schema.is(Cursor)(args[0]),
  (input: Cursor, options?: import("effect/SchemaAST").ParseOptions) => Schema.decodeEffect(Cursor)(input, options),
)
