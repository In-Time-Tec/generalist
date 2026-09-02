import { Schema } from "effect"

/** Per-entry description character cap. */
export const descriptionLimit = 1_024

/** @internal Parsed SKILL.md frontmatter shared by catalog implementations. */
export const Frontmatter = Schema.Struct({
  name: Schema.String,
  description: Schema.String.pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(descriptionLimit))),
  whenToUse: Schema.optionalKey(Schema.String),
  allowedTools: Schema.optionalKey(Schema.Array(Schema.String)),
  disableModelInvocation: Schema.optionalKey(Schema.Boolean),
  userInvocable: Schema.optionalKey(Schema.Boolean),
  contextFork: Schema.optionalKey(Schema.Boolean),
  paths: Schema.optionalKey(Schema.Array(Schema.String)),
})

/** @internal Parsed SKILL.md frontmatter shared by catalog implementations. */
export type Frontmatter = typeof Frontmatter.Type

export const listing = (skill: { readonly name: string; readonly description: string }): string =>
  `- ${skill.name}: ${skill.description}`
