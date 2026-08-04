import { Schema } from "effect"

export const Address = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand("Address"))
export type Address = typeof Address.Type

export const make = (value: string): Address => Schema.decodeSync(Address)(value)

export const encode = Schema.encodeEffect(Address)
export const decode = Schema.decodeEffect(Address)
