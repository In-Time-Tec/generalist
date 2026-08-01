import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { Effect } from "effect"

const ignored = new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated"])
const sourceFiles = (root: string): Array<string> => {
  const files: Array<string> = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue
      const file = join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(relative(root, file))
    }
  }
  visit(root)
  return files.toSorted()
}

const program = Effect.sync(() => {
  const root = resolve(".")
  const files = sourceFiles(root)
  const relationshipPath = join(root, "tooling/repository-graph/test-relationships.json")
  const explicit = JSON.parse(readFileSync(relationshipPath, "utf8")) as ReadonlyArray<{
    readonly source: string
    readonly test: string
    readonly kind: "same-stem" | "package-contract" | "integration" | "fixture"
  }>
  for (const relationship of explicit) {
    if (
      !files.includes(relationship.source) ||
      !files.includes(relationship.test) ||
      !relationship.test.endsWith(".test.ts")
    ) {
      throw new Error(`invalid test relationship: ${relationship.source} -> ${relationship.test}`)
    }
  }
  const relationships = [
    ...explicit,
    ...files
      .filter((file) => file.includes("/test/") || file.includes("/test."))
      .map((test) => ({ source: test, test, kind: "same-stem" as const })),
  ].toSorted((left, right) => `${left.source}:${left.test}`.localeCompare(`${right.source}:${right.test}`))
  const graph = {
    schemaVersion: 1,
    files: files.map((file) => ({ path: file })),
    relationships,
  }
  const output = join(root, "tooling/repository-graph/generated")
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, "repository-graph.json"), `${JSON.stringify(graph, null, 2)}\n`)
})

Effect.runSync(program)
console.log("repository graph generated")
