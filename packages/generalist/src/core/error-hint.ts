/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-object-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- This internal adapter preserves Schema.TaggedError's overloaded public type while extending its generated Error class. */
import { Effect, Schema } from "effect"

/** @internal Required error hint with backwards-compatible decoding and constructor defaults. */
export const errorHint = (value: string) =>
  Schema.String.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed(value)),
    Schema.withConstructorDefault(Effect.succeed(value)),
  )

const identifyingFields = new Set([
  "runId",
  "rootRunId",
  "parentRunId",
  "childRunId",
  "sessionId",
  "turn",
  "tool",
  "toolName",
  "toolCallId",
  "agent",
  "agentName",
  "name",
  "address",
  "provider",
  "model",
  "operation",
  "requestId",
  "taskId",
  "placementId",
  "settlementId",
  "cellId",
  "source",
  "path",
  "reason",
])

const oneLine = (value: string): string => value.replaceAll(/\s+/g, " ").trim()

const describe = (error: Record<string, unknown>): string => {
  const context = Object.entries(error)
    .filter(([key, value]) => identifyingFields.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")
  const hint = oneLine(String(error.hint))
  return `${String(error._tag)}${context.length > 0 ? ` (${context})` : ""}. Hint: ${hint}`
}

/** @internal Schema TaggedError whose printed name includes identifying fields and its actionable hint. */
type ErrorConstructor = new (props: Record<string, unknown>) => Error & Record<string, unknown>
const taggedError = Schema.TaggedError as unknown as (
  identifier?: string,
) => (tag: string, fields: Schema.Struct.Fields, annotations?: object) => ErrorConstructor

export const ActionableTaggedError: typeof Schema.TaggedError = ((identifier?: string) =>
  (tag: string, fields: Schema.Struct.Fields, annotations?: object) => {
    const Base = taggedError(identifier)(tag, fields, annotations)
    return class extends Base {
      constructor(props: Record<string, unknown>) {
        super(props)
        const actionable = describe(this)
        if (Object.hasOwn(this, "name")) {
          if (!this.message.includes(". Hint: ")) this.message = `${oneLine(this.message)} ${actionable}`.trim()
        } else {
          Object.defineProperty(this, "name", {
            value: actionable,
            configurable: true,
            writable: true,
          })
        }
      }
    }
  }) as typeof Schema.TaggedError
