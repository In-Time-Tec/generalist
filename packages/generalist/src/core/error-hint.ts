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
  const current = typeof error.message === "string" ? oneLine(error.message) : ""
  if (current.includes(" Hint: ")) return current

  const context = Object.entries(error)
    .filter(([key, value]) => identifyingFields.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")
  const what = current.length > 0 ? current : String(error._tag)
  const hint = oneLine(String(error.hint))
  return `${what}${context.length > 0 ? ` (${context})` : ""}. Hint: ${hint}`
}

/** @internal Schema TaggedError whose native message includes identifying fields and its actionable hint. */
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
        this.message = describe(this)
      }
    }
  }) as typeof Schema.TaggedError
