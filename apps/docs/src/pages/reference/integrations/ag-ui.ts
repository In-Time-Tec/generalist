import { code, command, definePage, h2, lead, link, p } from "../../../prose"

export const agUiReference = definePage({
  path: "/docs/reference/ag-ui",
  title: "generalist/ag-ui",
  navTitle: "ag-ui",
  group: "Reference",
  description: "AG-UI 0.0.57 event projection over authoritative Runtime runs.",
  content: [
    lead("generalist/ag-ui projects canonical Runtime runs into AG-UI events."),
    command("Install", "bun add effect@4.0.0-rc.112 generalist@0.44.0 @ag-ui/core@0.0.57"),
    p(code("generalist/ag-ui"), " is an import subpath. Runtime remains the persisted source of truth."),
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
    p("See ", link("/docs/reference/runtime", "generalist/runtime"), "."),
  ],
})
