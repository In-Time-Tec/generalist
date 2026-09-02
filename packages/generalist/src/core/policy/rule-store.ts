import { Context, Effect, Schema } from "effect"

/** What a matched permission rule grants. */
export type Level = "allow" | "deny" | "ask"

/** One ordered permission rule. */
export interface Rule {
  readonly pattern: string
  readonly level: Level
  readonly reason?: string
}

/** Schema for one persisted permission rule. */
export const RuleSchema = Schema.Struct({
  pattern: Schema.String,
  level: Schema.Literals(["allow", "deny", "ask"]),
  reason: Schema.optionalKey(Schema.String),
})

/** Schema for the permission rule file format. */
export const RuleFile = Schema.Array(RuleSchema)

/** Permission service failure. */
export class PermissionError extends Schema.TaggedError<PermissionError>()("generalist/core/PermissionError", {
  message: Schema.String,
}) {}

/** A permission rule file failed JSON/YAML parsing or Rule schema validation. */
export class InvalidRuleFile extends Schema.TaggedError<InvalidRuleFile>()("generalist/core/InvalidRuleFile", {
  path: Schema.String,
  issues: Schema.String,
}) {}

/** Permission rule persistence failure. */
export type RuleStoreError = PermissionError | InvalidRuleFile

/** Remembered permission-rule persistence boundary. */
export class RuleStore extends Context.Service<
  RuleStore,
  {
    readonly remember: (rule: Rule) => Effect.Effect<void, RuleStoreError>
    readonly rules: Effect.Effect<ReadonlyArray<Rule>, RuleStoreError>
  }
>()("generalist/core/policy/rule-store/RuleStore") {}
