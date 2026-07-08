import { collectHeadings, collectMarkdown, collectText, collectToc } from "./extract"
import type { Node, TocEntry } from "./node"

export type PageGroup = "Start" | "Learn" | "Guides" | "Reference"

export type PageInput = Readonly<{
  path: string
  title: string
  navTitle: string
  group: PageGroup
  description: string
  content: ReadonlyArray<Node>
}>

export type DocsPage = PageInput &
  Readonly<{
    toc: ReadonlyArray<TocEntry>
    searchHeadings: string
    searchBody: string
    markdown: string
  }>

export const definePage = (input: PageInput): DocsPage => ({
  ...input,
  toc: collectToc(input.content),
  searchHeadings: collectHeadings(input.content),
  searchBody: collectText(input.content),
  markdown: collectMarkdown(input.content),
})
