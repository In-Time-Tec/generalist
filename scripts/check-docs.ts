import { existsSync, readFileSync } from "node:fs"

const requiredFiles = [
  "docs/site/README.md",
  "apps/docs/src/content/registry.ts",
  "CONTEXT.md",
  "SPEC.md",
  "examples/tool-calling-chatbot/README.md",
  "examples/structured-extraction/README.md",
  "examples/hitl-over-sse/README.md",
  "examples/mcp-agent/README.md",
  "examples/memory-chat/README.md",
  "examples/multi-agent/README.md",
  "examples/eval-in-ci/README.md",
  "examples/capstone-local-assistant/README.md",
]

const fail = (message: string): never => {
  throw new Error(message)
}

for (const path of requiredFiles) {
  if (!existsSync(path)) fail(`Missing required file: ${path}`)
}

const pointer = readFileSync("docs/site/README.md", "utf8")
for (const phrase of ["apps/docs", "docs/spec", "batonfx-docs.up.railway.app"]) {
  if (!pointer.includes(phrase)) fail(`docs/site/README.md must reference ${phrase}`)
}

const registry = readFileSync("apps/docs/src/content/registry.ts", "utf8")
if (!registry.includes("allPages")) fail("apps/docs registry must export allPages")

console.log(`check-docs: ${requiredFiles.length} required files present`)
