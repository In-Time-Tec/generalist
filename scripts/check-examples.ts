import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

const singlePackageExamples = [
  "tool-calling-chatbot",
  "structured-extraction",
  "hitl-over-sse",
  "mcp-agent",
  "memory-chat",
  "multi-agent",
  "eval-in-ci",
  "capstone-local-assistant",
]

const multiPackageExamples = ["deep-research-agent"]

const documentationGuidePackages = ["core", "foldkit", "mcp", "memory", "providers", "skills", "test", "transport"]

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

const parseManifest = (path: string) =>
  JSON.parse(read(path)) as {
    private?: boolean
    scripts?: Record<string, string>
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }

const checkWorkspaceVersions = (
  manifest: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  },
  dir: string,
) => {
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
}

for (const name of singlePackageExamples) {
  const dir = join("examples", name)
  for (const file of ["package.json", "tsconfig.json", "README.md", "src/index.ts"]) {
    if (!existsSync(join(dir, file))) fail(`${dir} is missing ${file}`)
  }

  const manifest = parseManifest(join(dir, "package.json"))

  if (manifest.private !== true) fail(`${dir}/package.json must be private`)
  if (manifest.scripts?.start === undefined) fail(`${dir}/package.json must define scripts.start`)
  if (manifest.scripts?.typecheck === undefined) fail(`${dir}/package.json must define scripts.typecheck`)

  checkWorkspaceVersions(manifest, dir)

  const source = read(join(dir, "src/index.ts"))
  for (const credentialName of credentialNames) {
    if (source.includes(credentialName)) fail(`${dir}/src/index.ts must not require ${credentialName}`)
  }
}

for (const name of multiPackageExamples) {
  const dir = join("examples", name)
  const serverDir = join(dir, "server")
  const webDir = join(dir, "web")
  for (const file of ["package.json", "server/package.json", "server/tsconfig.json", "server/src/index.ts"]) {
    if (!existsSync(join(dir, file))) fail(`${dir} is missing ${file}`)
  }
  for (const file of ["web/package.json", "web/tsconfig.json", "web/index.html", "web/src/main.ts"]) {
    if (!existsSync(join(dir, file))) fail(`${dir} is missing ${file}`)
  }

  const manifest = parseManifest(join(dir, "package.json"))
  const serverManifest = parseManifest(join(serverDir, "package.json"))
  const webManifest = parseManifest(join(webDir, "package.json"))

  if (manifest.private !== true) fail(`${dir}/package.json must be private`)
  if (manifest.scripts?.start === undefined) fail(`${dir}/package.json must define scripts.start`)
  if (manifest.scripts?.server === undefined) fail(`${dir}/package.json must define scripts.server`)
  if (manifest.scripts?.web === undefined) fail(`${dir}/package.json must define scripts.web`)
  if (manifest.scripts?.typecheck === undefined) fail(`${dir}/package.json must define scripts.typecheck`)
  if (manifest.scripts?.test === undefined) fail(`${dir}/package.json must define scripts.test`)
  if (serverManifest.private !== true) fail(`${serverDir}/package.json must be private`)
  if (serverManifest.scripts?.start === undefined) fail(`${serverDir}/package.json must define scripts.start`)
  if (serverManifest.scripts?.typecheck === undefined) fail(`${serverDir}/package.json must define scripts.typecheck`)
  if (webManifest.private !== true) fail(`${webDir}/package.json must be private`)
  if (webManifest.scripts?.dev === undefined) fail(`${webDir}/package.json must define scripts.dev`)
  if (webManifest.scripts?.build === undefined) fail(`${webDir}/package.json must define scripts.build`)
  if (webManifest.scripts?.typecheck === undefined) fail(`${webDir}/package.json must define scripts.typecheck`)

  checkWorkspaceVersions(manifest, dir)
  checkWorkspaceVersions(serverManifest, serverDir)
  checkWorkspaceVersions(webManifest, webDir)
}

const documentationGuidesDir = join("examples", "package-composition-guides")
for (const file of ["package.json", "tsconfig.json", ...documentationGuidePackages.map((name) => `src/${name}.ts`)]) {
  if (!existsSync(join(documentationGuidesDir, file))) fail(`${documentationGuidesDir} is missing ${file}`)
}

const documentationGuidesManifest = parseManifest(join(documentationGuidesDir, "package.json"))
if (documentationGuidesManifest.private !== true) fail(`${documentationGuidesDir}/package.json must be private`)
if (documentationGuidesManifest.scripts?.typecheck === undefined) {
  fail(`${documentationGuidesDir}/package.json must define scripts.typecheck`)
}
checkWorkspaceVersions(documentationGuidesManifest, documentationGuidesDir)

for (const name of documentationGuidePackages) {
  const readme = read(join("packages", name, "README.md"))
  const headings = [
    "## Install",
    "## Imports",
    "## Layer graph",
    "## Runnable program",
    "## Errors, requirements, and resources",
    "## More",
  ]
  let previousHeading = -1
  for (const heading of headings) {
    const headingIndex = readme.indexOf(heading)
    if (headingIndex === -1) fail(`packages/${name}/README.md is missing ${heading}`)
    if (headingIndex !== readme.lastIndexOf(heading)) fail(`packages/${name}/README.md repeats ${heading}`)
    if (headingIndex <= previousHeading) fail(`packages/${name}/README.md has composition-guide headings out of order`)
    previousHeading = headingIndex
  }
  if (!readme.includes(`examples/package-composition-guides/src/${name}.ts`)) {
    fail(`packages/${name}/README.md must link its checked composition guide`)
  }
  const snippet = readme.match(/## Runnable program[\s\S]*?```ts\n([\s\S]*?)\n```/)?.[1]
  if (snippet === undefined) fail(`packages/${name}/README.md must include one TypeScript runnable program`)
  const checkedSource = read(join(documentationGuidesDir, "src", `${name}.ts`)).trimEnd()
  if (snippet !== checkedSource) fail(`packages/${name}/README.md runnable program must match its checked source`)
  if (/from "@batonfx\/[^"/]+\//.test(checkedSource)) {
    fail(`examples/package-composition-guides/src/${name}.ts must use canonical package-root imports`)
  }
}
