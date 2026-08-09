import type { DocsPage, PageGroup } from "../prose/page"
import { dual } from "effect/Function"
import { approvals } from "../pages/guides/approvals"
import { compaction } from "../pages/guides/compaction"
import { defineTools } from "../pages/guides/define-tools"
import { foldkitChat } from "../pages/guides/foldkit-chat"
import { instructions } from "../pages/guides/instructions"
import { mcp } from "../pages/guides/mcp"
import { memory } from "../pages/guides/memory"
import { middleware } from "../pages/guides/middleware"
import { multiAgent } from "../pages/guides/multi-agent"
import { permissions } from "../pages/guides/permissions"
import { providers } from "../pages/guides/providers"
import { serveTransport } from "../pages/guides/serve-transport"
import { skills } from "../pages/guides/skills"
import { steering } from "../pages/guides/steering"
import { structuredOutput } from "../pages/guides/structured-output"
import { testingEvals } from "../pages/guides/testing-evals"
import { turnPolicy } from "../pages/guides/turn-policy"
import { agentLoop } from "../pages/learn/agent-loop"
import { nativeRuntime } from "../pages/learn/native-runtime"
import { comparisons } from "../pages/learn/comparisons"
import { onePayloadVocabulary } from "../pages/learn/one-payload-vocabulary"
import { seamsAsServices } from "../pages/learn/seams-as-services"
import { sessionsAndHistory } from "../pages/learn/sessions-and-history"
import { suspension } from "../pages/learn/suspension"
import { coreAgentReference } from "../pages/reference/core-agent"
import { coreContextReference } from "../pages/reference/core-context"
import { coreEventsReference } from "../pages/reference/core-events"
import { coreModelsReference } from "../pages/reference/core-models"
import { corePoliciesReference } from "../pages/reference/core-policies"
import { coreToolsReference } from "../pages/reference/core-tools"
import { a2aReference } from "../pages/reference/a2a"
import { agUiReference } from "../pages/reference/ag-ui"
import { foldkitReference } from "../pages/reference/foldkit"
import { harnessReference } from "../pages/reference/harness"
import { mcpReference } from "../pages/reference/mcp"
import { memoryReference } from "../pages/reference/memory"
import { providersReference } from "../pages/reference/providers"
import { replReference } from "../pages/reference/repl"
import { runtimeReference } from "../pages/reference/runtime"
import { skillsReference } from "../pages/reference/skills"
import { testReference } from "../pages/reference/test"
import { transportReference } from "../pages/reference/transport"
import { versioningReference } from "../pages/reference/versioning"
import { examples } from "../pages/start/examples"
import { installation } from "../pages/start/installation"
import { introduction } from "../pages/start/introduction"
import { quickstart } from "../pages/start/quickstart"
import { researchAgent } from "../pages/start/research-agent"

const groupOrder: ReadonlyArray<PageGroup> = ["Start", "Learn", "Guides", "Reference"]

export const allPages: ReadonlyArray<DocsPage> = [
  introduction,
  installation,
  quickstart,
  researchAgent,
  examples,
  agentLoop,
  onePayloadVocabulary,
  seamsAsServices,
  suspension,
  sessionsAndHistory,
  nativeRuntime,
  comparisons,
  defineTools,
  approvals,
  permissions,
  turnPolicy,
  structuredOutput,
  instructions,
  skills,
  memory,
  compaction,
  steering,
  providers,
  middleware,
  mcp,
  multiAgent,
  serveTransport,
  foldkitChat,
  testingEvals,
  coreAgentReference,
  coreEventsReference,
  coreToolsReference,
  corePoliciesReference,
  coreModelsReference,
  coreContextReference,
  runtimeReference,
  a2aReference,
  agUiReference,
  providersReference,
  mcpReference,
  skillsReference,
  testReference,
  memoryReference,
  replReference,
  harnessReference,
  transportReference,
  foldkitReference,
  versioningReference,
]

export type NavGroup = Readonly<{
  title: PageGroup
  pages: ReadonlyArray<DocsPage>
}>

export const navGroups: ReadonlyArray<NavGroup> = groupOrder.flatMap((title) => {
  const pages = allPages.filter((page) => page.group === title)
  return pages.length === 0 ? [] : [{ title, pages }]
})

export const pageByPath: ReadonlyMap<string, DocsPage> = new Map(allPages.map((page) => [page.path, page]))

export const defaultDocsPath: string = allPages[0]?.path ?? "/"

export const legacyRedirects: ReadonlyMap<string, string> = new Map([
  ["/docs/getting-started", "/docs/start/quickstart"],
  ["/docs/core/agent-loop", "/docs/learn/agent-loop"],
  ["/docs/core/session-event-log", "/docs/learn/sessions-and-history"],
  ["/docs/core/instructions", "/docs/guides/instructions"],
  ["/docs/core/permissions", "/docs/guides/permissions"],
  ["/docs/core/steering", "/docs/guides/steering"],
  ["/docs/core/compaction", "/docs/guides/compaction"],
  ["/docs/core/multi-agent", "/docs/guides/multi-agent"],
  ["/docs/packages/a2a", "/docs/reference/a2a"],
  ["/docs/packages/ag-ui", "/docs/reference/ag-ui"],
  ["/docs/packages/runtime", "/docs/reference/runtime"],
  ["/docs/packages/skills", "/docs/guides/skills"],
  ["/docs/packages/providers", "/docs/guides/providers"],
  ["/docs/packages/memory", "/docs/guides/memory"],
  ["/docs/packages/transport", "/docs/guides/serve-transport"],
  ["/docs/packages/foldkit", "/docs/guides/foldkit-chat"],
])

export type SearchResult = Readonly<{
  path: string
  title: string
  group: PageGroup
  excerpt: string
}>

type IndexedPage = Readonly<{
  page: DocsPage
  titleLower: string
  headingsLower: string
  bodyLower: string
}>

const searchIndex: ReadonlyArray<IndexedPage> = allPages.map((page) => ({
  page,
  titleLower: page.title.toLowerCase(),
  headingsLower: page.searchHeadings.toLowerCase(),
  bodyLower: page.searchBody.toLowerCase(),
}))

const excerptFor = (entry: IndexedPage, token: string): string => {
  const position = entry.bodyLower.indexOf(token)
  if (position === -1) {
    return entry.page.description
  }
  const start = Math.max(0, position - 60)
  const end = Math.min(entry.page.searchBody.length, position + token.length + 60)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < entry.page.searchBody.length ? "…" : ""
  return `${prefix}${entry.page.searchBody.slice(start, end).replace(/\n+/g, " ").trim()}${suffix}`
}

export const searchDocs: {
  (query: string, limit?: number): ReadonlyArray<SearchResult>
  (limit?: number): (query: string) => ReadonlyArray<SearchResult>
} = dual(
  (args) => args.length > 0 && typeof args[0] === "string",
  (query: string, limit: number = 8): ReadonlyArray<SearchResult> => {
    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((token) => token.length > 0)
    if (tokens.length === 0) {
      return allPages.slice(0, limit).map((page) => ({
        path: page.path,
        title: page.title,
        group: page.group,
        excerpt: page.description,
      }))
    }
    const scored = searchIndex.flatMap((entry) => {
      let score = 0
      for (const token of tokens) {
        const inTitle = entry.titleLower.includes(token)
        const inHeadings = entry.headingsLower.includes(token)
        const inBody = entry.bodyLower.includes(token)
        if (!inTitle && !inHeadings && !inBody) {
          return []
        }
        score += (inTitle ? 8 : 0) + (inHeadings ? 4 : 0) + (inBody ? 1 : 0)
      }
      return [{ entry, score }]
    })
    return scored
      .toSorted((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ entry }) => ({
        path: entry.page.path,
        title: entry.page.title,
        group: entry.page.group,
        excerpt: excerptFor(entry, tokens[0] ?? ""),
      }))
  },
)

const siteTagline =
  "Batonfx: an Effect-native TypeScript agent framework with plain-value agents, typed event streams, deterministic service seams, and an optional native durable Runtime."

export const llmsIndex = (): string => {
  const header: ReadonlyArray<string> = ["# Batonfx", "", `> ${siteTagline}`, ""]
  const sections = navGroups.flatMap((group) =>
    [`## ${group.title}`].concat(
      group.pages.map((page) => `- [${page.title}](${page.path}): ${page.description}`),
      [""],
    ),
  )
  return header.concat(sections).join("\n")
}

export const llmsFull = (): string =>
  [
    "# Batonfx",
    "",
    `> ${siteTagline}`,
    "",
    ...allPages.map((page) => `# ${page.title}\n\n${page.description}\n\n${page.markdown}`),
  ].join("\n\n---\n\n")
