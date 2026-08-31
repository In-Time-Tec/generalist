import { code, command, definePage, h2, lead, link, p } from "../../../prose"

export const a2aReference = definePage({
  path: "/docs/reference/a2a",
  title: "generalist/a2a",
  navTitle: "a2a",
  group: "Reference",
  description: "A2A v1 server projection over the authoritative Runtime lifecycle.",
  content: [
    lead("generalist/a2a maps A2A v1 tasks onto Runtime runs without storing a second lifecycle."),
    command("Install", "bun add effect@4.0.0-rc.112 generalist@0.44.0 @a2a-js/sdk@1.0.1"),
    p(code("generalist/a2a"), " is an import subpath. A2A task IDs are caller-selected Runtime Run IDs."),
    h2("service", "Service"),
    p(
      code("A2A.layer({ address, card })"),
      " requires the host's Runtime layer and exposes a v1 DefaultRequestHandler. Task snapshots, history, waits, cancellation, and terminal outcomes remain Runtime projections.",
    ),
    h2("input", "Remote input"),
    p(
      "Only user text/plain text parts and application/json data parts are admitted. Files, URLs, authority-bearing roles, and mismatched media are rejected before Runtime admission.",
    ),
    p("See ", link("/docs/reference/runtime", "generalist/runtime"), "."),
  ],
})
