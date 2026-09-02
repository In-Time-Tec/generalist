import { Context, Effect, Schema } from "effect"

/** @experimental What a matched permission rule grants. */
export type Level = "allow" | "deny" | "ask"

/** @experimental One ordered permission rule. */
export interface Rule {
  readonly pattern: string
  readonly level: Level
  readonly reason?: string
}

/** @experimental Schema for one persisted permission rule. */
export const RuleSchema = Schema.Struct({
  pattern: Schema.String,
  level: Schema.Literals(["allow", "deny", "ask"]),
  reason: Schema.optionalKey(Schema.String),
})

/** @experimental Schema for the permission rule file format. */
export const RuleFile = Schema.Array(RuleSchema)

/** @experimental Permission service failure. */
export class PermissionError extends Schema.TaggedError<PermissionError>()("generalist/core/PermissionError", {
  message: Schema.String,
}) {}

/** @experimental A permission rule file failed JSON/YAML parsing or Rule schema validation. */
export class InvalidRuleFile extends Schema.TaggedError<InvalidRuleFile>()("generalist/core/InvalidRuleFile", {
  path: Schema.String,
  issues: Schema.String,
}) {}

/** @experimental Permission rule persistence failure. */
export type RuleStoreError = PermissionError | InvalidRuleFile

/** @experimental Remembered permission-rule persistence boundary. */
export class RuleStore extends Context.Service<
  RuleStore,
  {
    readonly remember: (rule: Rule) => Effect.Effect<void, RuleStoreError>
    readonly rules: Effect.Effect<ReadonlyArray<Rule>, RuleStoreError>
  }
>()("generalist/core/policy/rule-store/RuleStore") {}
