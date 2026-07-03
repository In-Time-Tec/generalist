import { existsSync, readFileSync } from "node:fs"
import { dirname, join, normalize } from "node:path"

const requiredDocs = [
  "docs/site/README.md",
  "docs/site/getting-started.md",
  "docs/site/concepts/agent-loop.md",
  "docs/site/concepts/suspension-as-typed-error.md",
  "docs/site/concepts/seams-as-services.md",
  "docs/site/guides/tools-and-toolkits.md",
  "docs/site/guides/approvals-hitl-permissions.md",
  "docs/site/guides/steering-interrupts.md",
  "docs/site/guides/structured-output.md",
  "docs/site/guides/skills.md",
  "docs/site/guides/instructions-context-sources.md",
  "docs/site/guides/compaction.md",
  "docs/site/guides/memory.md",
  "docs/site/guides/mcp.md",
  "docs/site/guides/model-registry-providers.md",
  "docs/site/guides/middleware-guardrails-resilience.md",
  "docs/site/guides/multi-agent.md",
  "docs/site/guides/streaming-ui-foldkit.md",
  "docs/site/guides/testing-evals.md",
  "docs/site/recipes/context-truncation-middleware.md",
  "docs/site/recipes/pgvector-vector-store.md",
  "docs/site/recipes/pii-scrub-guardrail.md",
  "docs/site/recipes/token-budget-turn-policy.md",
  "docs/site/recipes/gemini-openai-compat.md",
  "docs/site/reference/api-stability.md",
  "docs/site/reference/package-exports.md",
  "docs/site/reference/release-0.1.0.md",
  "docs/site/positioning/baton-vs-ai-sdk.md",
  "docs/site/positioning/baton-vs-mastra.md",
  "docs/site/positioning/baton-relay-durability.md",
]

const requiredExamples = [
  "examples/tool-calling-chatbot/README.md",
  "examples/structured-extraction/README.md",
  "examples/hitl-over-sse/README.md",
  "examples/mcp-agent/README.md",
  "examples/memory-chat/README.md",
  "examples/multi-agent/README.md",
  "examples/eval-in-ci/README.md",
  "examples/capstone-local-assistant/README.md",
]

const read = (path: string) => readFileSync(path, "utf8")

const fail = (message: string): never => {
  throw new Error(message)
}

for (const path of requiredDocs) {
  if (!existsSync(path)) fail(`Missing required docs page: ${path}`)
  const content = read(path)
  if (!content.startsWith("# ")) fail(`${path} must start with an H1`)
}

const index = read("docs/site/README.md")

for (const path of [...requiredDocs.slice(1), ...requiredExamples, "CONTEXT.md", "SPEC.md"]) {
  if (!index.includes(path.replace("docs/site/", "")) && !index.includes(`../../${path}`) && !index.includes(path)) {
    fail(`docs/site/README.md must link to ${path}`)
  }
}

const apiStability = read("docs/site/reference/api-stability.md")
for (const phrase of ["0.1.0", "@experimental", "effect/unstable/ai", "stable", "experimental"]) {
  if (!apiStability.includes(phrase)) fail(`api-stability.md must mention ${phrase}`)
}

const positioning = read("docs/site/positioning/baton-relay-durability.md")
for (const phrase of ["standalone", "non-durable", "Effect-native", "Relay", "durable runtime"]) {
  if (!positioning.includes(phrase)) fail(`baton-relay-durability.md must mention ${phrase}`)
}

const linkPattern = /\[[^\]]+]\((?!https?:|mailto:|#)([^)]+)\)/g
for (const path of requiredDocs) {
  const content = read(path)
  for (const match of content.matchAll(linkPattern)) {
    const target = match[1]?.split("#")[0]
    if (target === undefined || target.length === 0) continue
    const resolved = normalize(join(dirname(path), target))
    if (!existsSync(resolved)) fail(`${path} links to missing file ${target}`)
  }
}
