import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const examples = [
  "tool-calling-chatbot",
  "structured-extraction",
  "hitl-over-sse",
  "mcp-agent",
  "memory-chat",
  "multi-agent",
  "eval-in-ci",
  "capstone-local-assistant",
]

const credentialNames = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "GOOGLE_API_KEY",
  "MISTRAL_API_KEY",
]

const read = (path: string) => readFileSync(path, "utf8")

const fail = (message: string): never => {
  throw new Error(message)
}

for (const name of examples) {
  const dir = join("examples", name)
  for (const file of ["package.json", "tsconfig.json", "README.md", "src/index.ts"]) {
    if (!existsSync(join(dir, file))) fail(`${dir} is missing ${file}`)
  }

  const manifest = JSON.parse(read(join(dir, "package.json"))) as {
    private?: boolean
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

  if (manifest.private !== true) fail(`${dir}/package.json must be private`)
  if (manifest.scripts?.start === undefined) fail(`${dir}/package.json must define scripts.start`)
  if (manifest.scripts?.typecheck === undefined) fail(`${dir}/package.json must define scripts.typecheck`)

  for (const section of [manifest.dependencies ?? {}, manifest.devDependencies ?? {}]) {
    for (const [dependency, version] of Object.entries(section)) {
      if (dependency.startsWith("@batonfx/") && version !== "workspace:*") {
        fail(`${dir} must depend on ${dependency} with workspace:*`)
      }
      if (["effect", "foldkit", "typescript", "@types/bun"].includes(dependency) && version !== "catalog:") {
        fail(`${dir} must depend on ${dependency} with catalog:`)
      }
    }
  }

  const source = read(join(dir, "src/index.ts"))
  for (const credentialName of credentialNames) {
    if (source.includes(credentialName)) fail(`${dir}/src/index.ts must not require ${credentialName}`)
  }
}
