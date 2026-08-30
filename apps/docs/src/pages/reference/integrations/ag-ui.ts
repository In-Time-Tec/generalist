import { code, command, definePage, h2, lead, link, p } from "../../../prose"

export const agUiReference = definePage({
  path: "/docs/reference/ag-ui",
  title: "tenetkit/ag-ui",
  navTitle: "ag-ui",
  group: "Reference",
  description: "AG-UI 0.0.57 event projection over authoritative Runtime runs.",
  content: [
    lead("tenetkit/ag-ui projects canonical Runtime runs into AG-UI events."),
    command("Install", "bun add @ag-ui/core@0.0.57 tenetkit/runtime tenetkit/ag-ui"),
    p("Published on npm at 0.14.0. Runtime remains the persisted source of truth."),
    h2("service", "Service"),
    p(
      code("AGUI.layer({ address })"),
      " requires the host's Runtime layer. ",
      code("AGUI.run(input)"),
      " returns the AG-UI event stream for the admitted or resumed run.",
    ),
    h2("boundary", "Input boundary"),
    p(
      "The adapter accepts only the final user message, preserves runId, maps threadId to the Runtime session, rejects client tools and authority-bearing roles, and resumes only the exact open Runtime wait.",
    ),
    p("See ", link("/docs/reference/runtime", "tenetkit/runtime"), "."),
  ],
})
