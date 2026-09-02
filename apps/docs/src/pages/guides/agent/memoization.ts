import { callout, code, definePage, h2, lead, p } from "../../../prose"

export const memoization = definePage({
  path: "/docs/guides/memoization",
  title: "Memoize declared-pure operations",
  navTitle: "Memoize pure operations",
  group: "Guides",
  description: "Reuse successful pure tool calls across Runs without weakening durable replay.",
  content: [
    lead(
      "Declare purity explicitly, key reuse by host-owned isolation and dependency versions, and keep replay on the journal.",
    ),
    h2("declare", "Declare a pure tool"),
    p(
      "Wrap an Effect AI tool with ",
      code('Memo.pure({ ttl: "6 hours", dependsOn: ["index-version"] })'),
      ". Undeclared tools are never read from or written to the memo store.",
    ),
    h2("provide", "Provide storage and key context"),
    p(
      "Provide ",
      code("Memo.layerMemory()"),
      " or ",
      code("Memo.layerSql()"),
      " together with ",
      code("Memo.layerDependencies({ tenant, capabilityScope, versions })"),
      ". SQL storage requires Runtime schema version 7.",
    ),
    callout(
      "warning",
      "Purity is a promise",
      "The repository rule catches common direct Sandbox, SQL-write, and non-GET HTTP handlers, but aliases and transitive side effects still require review.",
    ),
    h2("replay", "Replay stays exact"),
    p(
      "A hit is journaled as the ordinary tool result with ",
      code("memoized: { fromRun, fromOperation }"),
      ". Strict replay reads that recorded result and never consults the cache.",
    ),
  ],
})
