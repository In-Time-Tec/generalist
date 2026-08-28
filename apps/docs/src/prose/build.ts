import type { Html } from "foldkit/html"
import { Match, Schema } from "effect"
import { dual } from "effect/Function"

import type { CalloutTone, Inline, Node } from "./node"

export type InlineInput = string | Inline

export const toInline = Match.type<InlineInput>().pipe(
  Match.when(Match.string, (text) => ({ kind: "text" as const, text })),
  Match.orElse((input) => input),
)

export const toInlines = (inputs: ReadonlyArray<InlineInput>): ReadonlyArray<Inline> => inputs.map(toInline)

export const code = (text: string): Inline => ({ kind: "inlineCode", text })

export const link: {
  (href: string, text: string): Inline
  (text: string): (href: string) => Inline
} = dual(2, (href: string, text: string): Inline => ({ kind: "link", href, text }))

export const strong = (text: string): Inline => ({ kind: "strong", text })

export const h2: {
  (id: string, text: string): Node
  (text: string): (id: string) => Node
} = dual(2, (id: string, text: string): Node => ({ kind: "heading", level: 2, id, text }))

export const h3: {
  (id: string, text: string): Node
  (text: string): (id: string) => Node
} = dual(2, (id: string, text: string): Node => ({ kind: "heading", level: 3, id, text }))

export const lead = (text: string): Node => ({ kind: "lead", text })

export const p = (...content: ReadonlyArray<InlineInput>): Node => ({ kind: "para", content: toInlines(content) })

const inlineGroup = (item: InlineInput | ReadonlyArray<InlineInput>): ReadonlyArray<Inline> => {
  if (Schema.is(Schema.String)(item)) return [toInline(item)]
  if ("kind" in item) return [item]
  return item.map(toInline)
}

export const bullets = (...items: ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>): Node => ({
  kind: "bullets",
  items: items.map(inlineGroup),
})

export type CodeInput = Readonly<{
  label: string
  language?: string
  source: string
  expectedOutput?: string
}>

export const codeBlock = (input: CodeInput): Node => {
  const node = {
    kind: "code",
    label: input.label,
    language: input.language ?? "typescript",
    source: input.source.replace(/\n+$/, ""),
  } as const
  return input.expectedOutput === undefined
    ? node
    : { ...node, expectedOutput: input.expectedOutput.replace(/\n+$/, "") }
}

export const command: {
  (label: string, source: string): Node
  (source: string): (label: string) => Node
} = dual(2, (label: string, source: string): Node => codeBlock({ label, language: "bash", source }))

export const callout = (tone: CalloutTone, label: string, ...content: ReadonlyArray<InlineInput>): Node => ({
  kind: "callout",
  tone,
  label,
  content: toInlines(content),
})

export const table: {
  (head: ReadonlyArray<string>, rows: ReadonlyArray<ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>>): Node
  (rows: ReadonlyArray<ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>>): (head: ReadonlyArray<string>) => Node
} = dual(
  2,
  (
    head: ReadonlyArray<string>,
    rows: ReadonlyArray<ReadonlyArray<InlineInput | ReadonlyArray<InlineInput>>>,
  ): Node => ({
    kind: "table",
    head,
    rows: rows.map((row) => row.map(inlineGroup)),
  }),
)

export const pills = (items: ReadonlyArray<string>): Node => ({ kind: "pills", items })

export const custom: {
  (html: Html, text: string): Node
  (text: string): (html: Html) => Node
} = dual(2, (html: Html, text: string): Node => ({ kind: "custom", html, text }))
