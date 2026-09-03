import { Option, Schema } from "effect"
import { Invalid } from "./errors.js"
import { Scope } from "./state.js"

export const immutableScope = (scope: Scope): Scope =>
  Object.freeze(
    Object.fromEntries(Object.entries(scope).map(([dimension, patterns]) => [dimension, Object.freeze([...patterns])])),
  )

export const decodeScope = (scope: Scope): Scope => {
  const decoded = Schema.decodeOption(Scope)(scope)
  if (Option.isSome(decoded)) return immutableScope(decoded.value)
  throw Invalid.make({ reason: "scope", message: "Capability scope must contain non-empty string arrays" })
}

const escapePattern = (value: string): string => value.replace(/[.+?^${}()|[\]\\]/gu, "\\$&")

const matches = (pattern: string, value: string): boolean => {
  const expression = pattern.split("*").map(escapePattern).join(".*")
  return new RegExp(`^${expression}$`, "u").test(value)
}

const patternContainedBy = (candidate: string, parent: string): boolean => {
  if (candidate === parent) return true
  const wildcard = parent.indexOf("*")
  if (wildcard < 0 || !/^\*+$/u.test(parent.slice(wildcard))) return false
  return candidate.startsWith(parent.slice(0, wildcard))
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal authority relation with two required direct-style arguments.
export const isNarrower = (candidate: Scope, parent: Scope): boolean => {
  for (const [dimension, parentValues] of Object.entries(parent)) {
    const candidateValues = candidate[dimension]
    if (candidateValues === undefined) return false
    if (!candidateValues.every((value) => parentValues.some((parentValue) => patternContainedBy(value, parentValue)))) {
      return false
    }
  }
  return true
}

type ToolArguments = Readonly<Record<string, Schema.Json>>

const argumentValues = (
  arguments_: ToolArguments | undefined,
  dimension: string,
): ReadonlyArray<string> | undefined => {
  if (arguments_ === undefined) return undefined
  const singular = dimension.endsWith("s") ? dimension.slice(0, -1) : dimension
  const value = arguments_[dimension] ?? arguments_[singular]
  if (Schema.is(Schema.String)(value)) return [value]
  const values = Schema.decodeUnknownOption(Schema.Array(Schema.String))(value)
  return Option.isSome(values) ? values.value : undefined
}

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- internal authorization predicate with two required direct-style arguments.
export const scopeAllows = (scope: Scope, arguments_: ToolArguments | undefined): boolean =>
  Object.entries(scope).every(([dimension, patterns]) => {
    const values = argumentValues(arguments_, dimension)
    return values !== undefined && values.every((value) => patterns.some((pattern) => matches(pattern, value)))
  })
