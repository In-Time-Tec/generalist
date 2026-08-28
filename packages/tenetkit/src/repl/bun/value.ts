import { inspect as utilInspect } from "node:util"
import { Option, Schema } from "effect"

const RuntimeValue = Schema.Unknown
type RuntimeValue = typeof RuntimeValue.Type

const canonicalize = (value: Schema.Json): Schema.Json => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value === null || !Schema.is(Schema.JsonObject)(value)) return Object.is(value, -0) ? 0 : value
  return Object.fromEntries(
    Object.keys(value)
      .toSorted()
      .map((key) => [key, canonicalize(value[key]!)]),
  )
}

export const formatValue = (value: RuntimeValue): string => {
  if (Schema.is(Schema.String)(value)) return value
  if (Object.prototype.toString.call(value) === "[object Module]") return "[Module]"
  if (Error.isError(value)) return Bun.inspect(value, { depth: 4, colors: false })
  return utilInspect(value, { depth: 4, colors: false })
}

export const resultValue = (value: RuntimeValue): string => {
  if (Schema.is(Schema.String)(value) || Error.isError(value)) return formatValue(value)
  const json = Schema.decodeUnknownOption(Schema.Json)(value)
  return Option.isSome(json) ? JSON.stringify(canonicalize(json.value)) : formatValue(value)
}
