import { Schema } from "effect"

export const CodeToken = Schema.Struct({
  text: Schema.String,
  light: Schema.String,
  dark: Schema.String,
})
export const CodeLines = Schema.Array(Schema.Array(CodeToken))
export const CodeHighlights = Schema.Record(Schema.String, CodeLines)
export type CodeToken = typeof CodeToken.Type
export type CodeLines = typeof CodeLines.Type
export type CodeHighlights = typeof CodeHighlights.Type
