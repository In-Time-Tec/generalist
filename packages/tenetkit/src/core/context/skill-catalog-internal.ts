import { Schema } from "effect"

/** @experimental Per-entry description character cap. */
export const DESCRIPTION_CAP = 1_024

/** @internal Parsed SKILL.md frontmatter shared by catalog implementations. */
export const Frontmatter = Schema.Struct({
  name: Schema.String,
  description: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(DESCRIPTION_CAP))),
  whenToUse: Schema.optionalKey(Schema.String),
  allowedTools: Schema.optionalKey(Schema.Array(Schema.String)),
  disableModelInvocation: Schema.optionalKey(Schema.Boolean),
  userInvocable: Schema.optionalKey(Schema.Boolean),
  contextFork: Schema.optionalKey(Schema.Boolean),
  agent: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

/** @internal Parsed SKILL.md frontmatter shared by catalog implementations. */
export type Frontmatter = typeof Frontmatter.Type

export const listing = (skill: { readonly name: string; readonly description: string }): string =>
  `- ${skill.name}: ${skill.description}`
