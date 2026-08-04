import type { Html } from "foldkit/html"

import type { CalloutTone, Inline, Node } from "./node"

export type InlineInput = string | Inline

export const toInline = (input: InlineInput): Inline =>
  typeof input === "string" ? { kind: "text", text: input } : input

export const toInlines = (inputs: ReadonlyArray<InlineInput>): ReadonlyArray<Inline> => inputs.map(toInline)

export const code = (text: string): Inline => ({ kind: "inlineCode", text })

export const link = (href: string, text: string): Inline => ({ kind: "link", href, text })

export const strong = (text: string): Inline => ({ kind: "strong", text })

export const h2 = (id: string, text: string): Node => ({ kind: "heading", level: 2, id, text })

export const h3 = (id: string, text: string): Node => ({ kind: "heading", level: 3, id, text })

export const lead = (text: string): Node => ({ kind: "lead", text })

export const p = (...content: ReadonlyArray<InlineInput>): Node => ({ kind: "para", content: toInlines(content) })

export const bullets = (...items: ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>): Node => ({
  kind: "bullets",
  items: items.map((item) => (Array.isArray(item) ? toInlines(item) : [toInline(item as InlineInput)])),
})

export type CodeInput = Readonly<{
  label: string
  language?: string
  source: string
  expectedOutput?: string
}>

export const codeBlock = (input: CodeInput): Node => ({
  kind: "code",
  label: input.label,
  language: input.language ?? "typescript",
  source: input.source.replace(/\n+$/, ""),
  ...(input.expectedOutput === undefined ? {} : { expectedOutput: input.expectedOutput.replace(/\n+$/, "") }),
})

export const command = (label: string, source: string): Node => codeBlock({ label, language: "bash", source })

export const callout = (tone: CalloutTone, label: string, ...content: ReadonlyArray<InlineInput>): Node => ({
  kind: "callout",
  tone,
  label,
  content: toInlines(content),
})

export const table = (
  head: ReadonlyArray<string>,
  rows: ReadonlyArray<ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>>,
): Node => ({
  kind: "table",
  head,
  rows: rows.map((row) => row.map((cell) => (Array.isArray(cell) ? toInlines(cell) : [toInline(cell as InlineInput)]))),
})

export const pills = (items: ReadonlyArray<string>): Node => ({ kind: "pills", items })

export const custom = (html: Html, text: string): Node => ({ kind: "custom", html, text })
