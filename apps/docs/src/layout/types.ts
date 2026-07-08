import type { Html } from "foldkit/html"

import type { TocEntry } from "../prose/node"

export type { TocEntry }

export type DocsPageView = Readonly<{
  title: string
  navTitle: string
  body: Html
  toc: ReadonlyArray<TocEntry>
}>
