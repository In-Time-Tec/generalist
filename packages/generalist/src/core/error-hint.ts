/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/no-object-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion -- This internal adapter preserves Schema.TaggedError's overloaded public type while extending its generated Error class. */
import { Effect, Option, Schema } from "effect"

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

const maxIssueLength = 300
const Issues = Schema.Union([Schema.String, Schema.Array(Schema.Json)])

const firstIssue = (issues: typeof Issues.Type): string | undefined => {
  const issue: unknown = typeof issues === "string" ? issues : issues[0]
  if (issue === undefined) return undefined
  const rendered = oneLine(typeof issue === "string" ? issue : (JSON.stringify(issue) ?? "null"))
  return rendered.length <= maxIssueLength ? rendered : `${rendered.slice(0, maxIssueLength - 1)}…`
}

const describe = (error: Record<string, unknown>): string => {
  const context = Object.entries(error)
    .filter(([key, value]) => identifyingFields.has(key) && value !== undefined)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(" ")
  const decodedIssues = Schema.decodeUnknownOption(Issues)(error.issues)
  const issue = Option.isSome(decodedIssues) ? firstIssue(decodedIssues.value) : undefined
  const detail =
    issue === undefined ? context : [context, `issue=${issue}`].filter((value) => value.length > 0).join(" ")
  const hint = oneLine(String(error.hint))
  return detail.length > 0 ? `${detail}. Hint: ${hint}` : `Hint: ${hint}`
}

/**
 * @internal Schema TaggedError whose native `message` is derived from its identifying fields and hint
 * when the schema declares no `message` field. Errors that declare `message` keep that value; their
 * `hint` stays a separate field. `name` is always the tag, as Effect sets it.
 */
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
        if (!Object.hasOwn(this, "message")) {
          Object.defineProperty(this, "message", {
            value: describe(this),
            configurable: true,
            writable: true,
          })
        }
      }
    }
  }) as typeof Schema.TaggedError
