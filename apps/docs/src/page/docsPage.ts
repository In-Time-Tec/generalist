import type { DocPage } from "../content/docs"
import * as prose from "../layout/prose"
import type { DocsPageView } from "../layout/types"

export const renderDocsPage = (page: DocPage): DocsPageView => ({
  title: page.title,
  toc: [
    { id: "overview", label: "Overview" },
    { id: "invariants", label: "Invariants" },
    { id: "exports", label: "Exports" },
    ...(page.examples.length === 0 ? [] : [{ id: "examples", label: "Examples" }]),
  ],
  body: prose.section([
    prose.h1("overview", page.title),
    prose.lead(page.lead),
    prose.ul(page.summary),
    prose.h2("invariants", "Invariants"),
    prose.ul(page.invariants),
    prose.h2("exports", "Exports"),
    page.exports.length === 0
      ? prose.p("This page covers concepts rather than package exports.")
      : prose.pillList(page.exports),
    ...(page.examples.length === 0
      ? []
      : [
          prose.h2("examples", "Examples"),
          ...page.examples.map((example) => prose.commandBlock(example.label, example.language, example.code)),
        ]),
  ]),
})
