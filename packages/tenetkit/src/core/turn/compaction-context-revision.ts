import { Schema } from "effect"
import { Prompt } from "effect/unstable/ai"

interface RevisionRecord {
  readonly [key: string]: RevisionValue
}
interface RevisionArray extends ReadonlyArray<RevisionValue> {}
type RevisionValue = string | number | boolean | bigint | symbol | RevisionRecord | RevisionArray | null | undefined
const RevisionValue: Schema.Codec<RevisionValue> = Schema.Union([
  Schema.String,
  Schema.Finite,
  Schema.Boolean,
  Schema.BigInt,
  Schema.Symbol,
  Schema.Null,
  Schema.Undefined,
  Schema.Array(Schema.suspend((): Schema.Codec<RevisionValue> => RevisionValue)),
  Schema.Record(
    Schema.String,
    Schema.suspend((): Schema.Codec<RevisionValue> => RevisionValue),
  ),
])
const revisionRecord = Schema.Record(Schema.String, Schema.Unknown)

const hasFaithfulJsonIdentity = (value: RevisionValue, ancestors: Set<object> = new Set()): boolean => {
  if (Schema.is(Schema.String)(value) || Schema.is(Schema.Boolean)(value)) return true
  if (Schema.is(Schema.Finite)(value)) return !Object.is(value, -0)
  if (value === null) return true
  if (Array.isArray(value)) {
    if (ancestors.has(value)) return false
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return false
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (
        descriptor === undefined ||
        "get" in descriptor ||
        !Schema.is(RevisionValue)(descriptor.value) ||
        !hasFaithfulJsonIdentity(descriptor.value, new Set(ancestors).add(value))
      )
        return false
    }
    return Object.getOwnPropertyNames(value).every((key) => {
      if (key === "length") return true
      const index = Number(key)
      return Number.isInteger(index) && index >= 0 && index < value.length && String(index) === key
    })
  }
  if (Schema.is(revisionRecord)(value)) {
    if (ancestors.has(value)) return false
    const prototype = Object.getPrototypeOf(value)
    if ((prototype !== Object.prototype && prototype !== null) || Object.getOwnPropertySymbols(value).length > 0)
      return false
    return Object.getOwnPropertyNames(value).every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return (
        descriptor !== undefined &&
        descriptor.enumerable &&
        "value" in descriptor &&
        Schema.is(RevisionValue)(descriptor.value) &&
        hasFaithfulJsonIdentity(descriptor.value, new Set(ancestors).add(value))
      )
    })
  }
  return false
}

export const ContextRevision = {
  make: (
    pathLeafId: string | null,
    history: Prompt.Prompt["content"],
    prompt: Prompt.Prompt["content"],
  ): string | undefined => {
    try {
      const input = [pathLeafId, history, prompt]
      if (!Schema.is(RevisionValue)(input)) return undefined
      if (!hasFaithfulJsonIdentity(input)) return undefined
      const context = JSON.stringify(input)
      let hash = 2_166_136_261
      for (let index = 0; index < context.length; index += 1)
        hash = Math.imul(hash ^ context.charCodeAt(index), 16_777_619)
      return `${context.length}:${hash >>> 0}`
    } catch {
      return undefined
    }
  },
}
