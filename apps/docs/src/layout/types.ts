import type { Html } from "foldkit/html"

export type TocEntry = Readonly<{
  id: string
  label: string
}>

export type DocsPageView = Readonly<{
  title: string
  body: Html
  toc: ReadonlyArray<TocEntry>
}>
