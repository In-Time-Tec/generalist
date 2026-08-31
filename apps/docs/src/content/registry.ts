import type { DocsPage, PageGroup } from "../prose/page"
import { Schema } from "effect"
import { dual } from "effect/Function"
import { addressedMessaging } from "../pages/guides/agent/addressed-messaging"
import { approvals } from "../pages/guides/agent/approvals"
import { compaction } from "../pages/guides/agent/compaction"
import { instructionGuidance } from "../pages/guides/agent/instruction-guidance"
import { defineTools } from "../pages/guides/tools/define-tools"
import { durableCompositeTools } from "../pages/guides/tools/durable-composite-tools"
import { foldkitChat } from "../pages/guides/runtime/foldkit-chat"
import { instructions } from "../pages/guides/agent/instructions"
import { mcp } from "../pages/guides/tools/mcp"
import { memory } from "../pages/guides/agent/memory"
import { middleware } from "../pages/guides/agent/middleware"
import { multiAgent } from "../pages/guides/agent/multi-agent"
import { permissions } from "../pages/guides/agent/permissions"
import { providers } from "../pages/guides/runtime/providers"
import { serveTransport } from "../pages/guides/runtime/serve-transport"
import { skills } from "../pages/guides/tools/skills"
import { steering } from "../pages/guides/agent/steering"
import { structuredOutput } from "../pages/guides/tools/structured-output"
import { testingEvals } from "../pages/guides/runtime/testing-evals"
import { turnPolicy } from "../pages/guides/agent/turn-policy"
import { typescriptCells } from "../pages/guides/tools/typescript-cells"
import { agentLoop } from "../pages/learn/agent-loop"
import { nativeRuntime } from "../pages/learn/native-runtime"
import { comparisons } from "../pages/learn/comparisons"
import { kernelBoundaries } from "../pages/learn/kernel-boundaries"
import { onePayloadVocabulary } from "../pages/learn/one-payload-vocabulary"
import { seamsAsServices } from "../pages/learn/seams-as-services"
import { sessionsAndHistory } from "../pages/learn/sessions-and-history"
import { suspension } from "../pages/learn/suspension"
import { coreAgentReference } from "../pages/reference/core/agent"
import { coreContextReference } from "../pages/reference/core/context"
import { coreEventsReference } from "../pages/reference/core/events"
import { coreModelsReference } from "../pages/reference/core/models"
import { corePoliciesReference } from "../pages/reference/core/policies"
import { coreToolsReference } from "../pages/reference/core/tools"
import { a2aReference } from "../pages/reference/integrations/a2a"
import { agUiReference } from "../pages/reference/integrations/ag-ui"
import { foldkitReference } from "../pages/reference/runtime/foldkit"
import { instructionGuidanceReference } from "../pages/reference/runtime/instruction-guidance"
import { mcpReference } from "../pages/reference/integrations/mcp"
import { memoryReference } from "../pages/reference/integrations/memory"
import { providersReference } from "../pages/reference/integrations/providers"
import { replReference } from "../pages/reference/runtime/repl"
import { runtimeReference } from "../pages/reference/runtime/host"
import { skillsReference } from "../pages/reference/integrations/skills"
import { testReference } from "../pages/reference/runtime/test"
import { transportReference } from "../pages/reference/runtime/transport"
import { versioningReference } from "../pages/reference/runtime/versioning"
import { cellAgent } from "../pages/start/cell-agent"
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
  cellAgent,
  examples,
  agentLoop,
  onePayloadVocabulary,
  seamsAsServices,
  suspension,
  sessionsAndHistory,
  nativeRuntime,
  kernelBoundaries,
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
  typescriptCells,
  instructionGuidance,
  durableCompositeTools,
  addressedMessaging,
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
  instructionGuidanceReference,
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
  (args) => args.length > 0 && Schema.is(Schema.String)(args[0]),
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
  "Generalist: an Effect-native TypeScript agent framework with plain-value agents, typed event streams, deterministic service seams, and an optional native durable Runtime."

export const llmsIndex = (): string => {
  const header: ReadonlyArray<string> = ["# Generalist", "", `> ${siteTagline}`, ""]
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
    "# Generalist",
    "",
    `> ${siteTagline}`,
    "",
    ...allPages.map((page) => `# ${page.title}\n\n${page.description}\n\n${page.markdown}`),
  ].join("\n\n---\n\n")
