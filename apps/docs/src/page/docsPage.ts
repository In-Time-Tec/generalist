import type { Html } from "foldkit/html"
import { html } from "foldkit/html"

import { badge } from "@/components/ui/badge"

import type { Message } from "../app/message"
import type { DocPage } from "../content/docs"
import * as prose from "../layout/prose"
import type { DocsPageView } from "../layout/types"

const h = html<Message>()

const sourceList = (page: DocPage): Html =>
  h.div(
    [h.Class("mt-5 flex flex-wrap gap-2")],
    page.source.map((source) => badge({ variant: "outline" }, [source])),
  )

export const renderDocsPage = (page: DocPage): DocsPageView => ({
  title: page.title,
  toc: [
    { id: "overview", label: "Overview" },
    { id: "invariants", label: "Invariants" },
    { id: "exports", label: "Exports" },
    ...(page.examples.length === 0 ? [] : [{ id: "examples", label: "Examples" }]),
    { id: "sources", label: "Sources" },
  ],
  body: prose.section([
    prose.h1("overview", page.title),
    prose.lead(page.lead),
    prose.ul(page.summary),
    prose.h2("invariants", "Invariants"),
    prose.ul(page.invariants),
    prose.h2("exports", "Verified exports"),
    page.exports.length === 0
      ? prose.p("This page indexes architecture records rather than package exports.")
      : prose.pillList(page.exports),
    ...(page.examples.length === 0
      ? []
      : [
          prose.h2("examples", "Examples"),
          ...page.examples.map((example) => prose.commandBlock(example.label, example.language, example.code)),
        ]),
    prose.h2("sources", "Sources"),
    prose.p(
      "This page is summarized from the maintained specification files and verified against the package source exports.",
    ),
    sourceList(page),
  ]),
})
