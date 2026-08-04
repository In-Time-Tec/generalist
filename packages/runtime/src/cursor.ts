import { Schema } from "effect"

export const Cursor = Schema.Int.check(
  Schema.isGreaterThanOrEqualTo(-1),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)
export type Cursor = typeof Cursor.Type

export const origin: Cursor = -1

export const make = (value: number): Cursor => Schema.decodeSync(Cursor)(value)

export const encode = Schema.encodeEffect(Cursor)
export const decode = Schema.decodeEffect(Cursor)
