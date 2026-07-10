import { readFileSync } from "node:fs"

const workflow = readFileSync(".github/workflows/publish.yml", "utf8")

const packages = [
  "packages/core",
  "packages/test",
  "packages/skills",
  "packages/memory",
  "packages/providers",
  "packages/mcp",
  "packages/transport",
  "packages/foldkit",
]

const fail = (message: string): never => {
  throw new Error(message)
}

if (!workflow.includes("workflow_dispatch:")) fail("publish workflow must be manually dispatched")
if (/\n\s+push:\n/.test(workflow)) fail("publish workflow must not publish on push to main")
if (!workflow.includes("version:")) fail("publish workflow must accept an explicit version input")
if (!workflow.includes("dry_run:")) fail("publish workflow must accept a dry_run input")
if (!workflow.includes("npm publish --access public --dry-run")) fail("publish workflow must dry-run every package")
if (!workflow.includes("bun run package:smoke")) fail("publish workflow must verify packed packages")
if (!workflow.includes("PACKAGE_ARTIFACT_DIR")) fail("publish workflow must retain verified tarballs")
if (!workflow.includes("release-artifacts/core.tgz")) fail("publish workflow must publish verified tarballs")
if (!workflow.includes("node-version: 22")) fail("publish workflow must verify the supported Node baseline")
if (!workflow.includes("workspace:")) {
  fail("publish workflow must rewrite workspace dependencies")
}
if (!workflow.includes("catalog:")) fail("publish workflow must rewrite catalog dependencies")
if (!workflow.includes("grep") || !workflow.includes("workspace:") || !workflow.includes("catalog:")) {
  fail("publish workflow must validate no workspace/catalog protocols remain")
}
if (!workflow.includes("v${version}")) fail("publish workflow must tag v${version}")

let cursor = -1
for (const pkg of packages) {
  const next = workflow.indexOf(pkg, cursor + 1)
  if (next === -1) fail(`publish workflow is missing ${pkg}`)
  if (next < cursor) fail(`publish workflow lists ${pkg} out of order`)
  cursor = next
}
