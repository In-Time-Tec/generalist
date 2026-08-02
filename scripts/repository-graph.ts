import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { Effect, Option } from "effect"
import { Argument, Command } from "effect/unstable/cli"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"

type Manifest = {
  readonly name?: unknown
  readonly private?: unknown
  readonly exports?: unknown
  readonly dependencies?: Record<string, string>
  readonly devDependencies?: Record<string, string>
  readonly peerDependencies?: Record<string, string>
  readonly workspaces?: unknown
}
type PackageNode = {
  readonly name: string
  readonly path: string
  readonly manifest: string
  readonly private: boolean
  readonly dependencies: ReadonlyArray<string>
  readonly exports: ReadonlyArray<string>
}
type ImportNode = {
  readonly source: string
  readonly specifier: string
  readonly target?: string
  readonly package?: string
}
type TestRelationship = {
  readonly source: string
  readonly test: string
  readonly kind: "same-stem" | "package-contract" | "integration" | "fixture"
}
type Graph = {
  readonly schemaVersion: 2
  readonly generatedBy: "Bun.Transpiler.scanImports"
  readonly files: ReadonlyArray<{ readonly path: string; readonly package?: string; readonly test: boolean }>
  readonly packages: ReadonlyArray<PackageNode>
  readonly imports: ReadonlyArray<ImportNode>
  readonly relationships: ReadonlyArray<TestRelationship>
  readonly violations: ReadonlyArray<string>
}

const ignored = new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated", ".git"])
const sourceFilePattern = /\.(?:ts|tsx|mts|cts)$/
const root = resolve(".")
const relativePath = (path: string): string => relative(root, path).split("\\").join("/")

const visit = (directory: string): Array<string> => {
  const result: Array<string> = []
  for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (ignored.has(entry.name)) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) result.push(...visit(path))
    else if (entry.isFile() && sourceFilePattern.test(entry.name)) result.push(path)
  }
  return result
}

const parseManifest = (path: string): Manifest => JSON.parse(readFileSync(path, "utf8")) as Manifest
const allFiles = (() => {
  const result: Array<string> = []
  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (ignored.has(entry.name)) continue
      const path = join(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) result.push(path)
    }
  }
  walk(root)
  return result
})()
const manifestPaths = allFiles.filter((path) => path.endsWith("package.json"))
const packageNodes = manifestPaths
  .map((manifestPath): PackageNode | undefined => {
    const manifest = parseManifest(manifestPath)
    if (typeof manifest.name !== "string") return undefined
    const packagePath = dirname(manifestPath)
    const dependencies = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
      ...manifest.peerDependencies,
    }).toSorted()
    const exports = exportSpecifiers(manifest.exports)
    return {
      name: manifest.name,
      path: relativePath(packagePath),
      manifest: relativePath(manifestPath),
      private: manifest.private === true,
      dependencies,
      exports,
    }
  })
  .filter((node): node is PackageNode => node !== undefined)
  .toSorted((left, right) => left.name.localeCompare(right.name))

const packageByName = new Map(packageNodes.map((node) => [node.name, node]))
const packageByPath = packageNodes.toSorted((left, right) => right.path.length - left.path.length)
const ownerOf = (path: string): string | undefined => {
  const owner = packageByPath.find((node) => path === node.path || path.startsWith(`${node.path}/`))
  return owner?.name
}
const files = visit(root)
  .filter((path) => sourceFilePattern.test(path))
  .map((path) => relativePath(path))
  .toSorted()
const fileSet = new Set(files)
const resolveSource = (source: string, specifier: string): string | undefined => {
  if (!specifier.startsWith(".")) return undefined
  const base = resolve(dirname(source), specifier)
  const candidates = [
    base,
    ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => `${base}${extension}`),
    ...["index.ts", "index.tsx"].map((name) => join(base, name)),
  ]
  return candidates.map(relativePath).find((candidate) => fileSet.has(candidate))
}

function exportSpecifiers(value: unknown): Array<string> {
  if (value === undefined || value === null) return ["."]
  if (typeof value === "string") return ["."]
  if (Array.isArray(value)) return ["."]
  if (typeof value !== "object") return []
  return Object.keys(value).toSorted()
}
const publicSpecifier = (specifier: string, packageNode: PackageNode): boolean => {
  const suffix = specifier.slice(packageNode.name.length)
  const subpath = suffix.length === 0 ? "." : `.${suffix}`
  return packageNode.exports.includes(subpath)
}

const imports = (() => {
  const transpiler = new Bun.Transpiler({ loader: "ts" })
  const result: Array<ImportNode> = []
  for (const file of files) {
    const source = join(root, file)
    for (const found of transpiler.scanImports(readFileSync(source, "utf8"))) {
      const target = resolveSource(source, found.path)
      const packageNode = [...packageByName.values()].find(
        (node) => found.path === node.name || found.path.startsWith(`${node.name}/`),
      )
      result.push({
        source: file,
        specifier: found.path,
        ...(target === undefined ? {} : { target }),
        ...(packageNode === undefined ? {} : { package: packageNode.name }),
      })
    }
  }
  return result
    .filter(
      (edge, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.source === edge.source &&
            candidate.specifier === edge.specifier &&
            candidate.target === edge.target,
        ) === index,
    )
    .toSorted((left, right) =>
      `${left.source}:${left.specifier}:${left.target ?? ""}`.localeCompare(
        `${right.source}:${right.specifier}:${right.target ?? ""}`,
      ),
    )
})()

const isTest = (path: string): boolean => path.includes("/test/") || /(?:\.test|\.spec)\.[^.]+$/.test(path)
const explicitPath = join(root, "tooling/repository-graph/test-relationships.json")
const explicit = JSON.parse(readFileSync(explicitPath, "utf8")) as ReadonlyArray<TestRelationship>
const relationships = [...explicit]
  .concat(files.filter(isTest).map((test) => ({ source: test, test, kind: "same-stem" as const })))
  .filter(
    (relationship, index, all) =>
      all.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(relationship)) === index,
  )
  .toSorted((left, right) => `${left.source}:${left.test}`.localeCompare(`${right.source}:${right.test}`))

const packageEdges = new Map<string, Set<string>>()
for (const node of packageNodes) {
  const dependencies = node.dependencies.filter((dependency) => packageByName.has(dependency))
  packageEdges.set(node.name, new Set(dependencies))
}
for (const edge of imports) {
  const sourcePackage = ownerOf(edge.source)
  if (
    sourcePackage !== undefined &&
    edge.package !== undefined &&
    sourcePackage !== edge.package &&
    packageByName.has(edge.package)
  ) {
    packageEdges.get(sourcePackage)?.add(edge.package)
  }
}
const cycles = (): Array<string> => {
  const found: Array<string> = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const walk = (node: string, path: Array<string>): void => {
    if (visiting.has(node)) {
      const start = path.indexOf(node)
      found.push([...path.slice(start), node].join(" -> "))
      return
    }
    if (visited.has(node)) return
    visiting.add(node)
    for (const dependency of packageEdges.get(node) ?? []) walk(dependency, [...path, node])
    visiting.delete(node)
    visited.add(node)
  }
  for (const node of packageEdges.keys()) walk(node, [])
  return found.toSorted()
}
const violations = [
  ...cycles().map((cycle) => `package cycle: ${cycle}`),
  ...imports.flatMap((edge) => {
    const packageNode = edge.package === undefined ? undefined : packageByName.get(edge.package)
    if (packageNode === undefined || !edge.specifier.startsWith(`${packageNode.name}/`)) return []
    return publicSpecifier(edge.specifier, packageNode)
      ? []
      : [`non-public package import: ${edge.source} -> ${edge.specifier}`]
  }),
  ...explicit.flatMap((relationship) =>
    fileSet.has(relationship.source) && fileSet.has(relationship.test) && isTest(relationship.test)
      ? []
      : [`invalid test relationship: ${relationship.source} -> ${relationship.test}`],
  ),
]
const graph: Graph = {
  schemaVersion: 2,
  generatedBy: "Bun.Transpiler.scanImports",
  files: files.map((path) => ({
    path,
    ...(ownerOf(path) === undefined ? {} : { package: ownerOf(path) }),
    test: isTest(path),
  })),
  packages: packageNodes,
  imports,
  relationships,
  violations: violations.toSorted(),
}
const graphPath = join(root, "tooling/repository-graph/generated/repository-graph.json")
const serialized = `${JSON.stringify(graph, null, 2)}\n`
const readGraph = (): string => {
  if (!existsSync(graphPath)) throw new Error("repository graph is missing; run generate")
  return readFileSync(graphPath, "utf8")
}
const printList = (title: string, values: ReadonlyArray<string>): void => {
  console.log(`${title}:`)
  for (const value of values) console.log(`- ${value}`)
}
const packageForArgument = (value: string): string | undefined =>
  packageByName.has(value) ? value : packageNodes.find((node) => node.path === value || node.name === value)?.name
const run = (argument: string, value: string | undefined): void => {
  if (argument === "generate") {
    mkdirSync(dirname(graphPath), { recursive: true })
    writeFileSync(graphPath, serialized)
    console.log(`repository graph generated (${files.length} files, ${imports.length} imports)`)
    return
  }
  if (argument === "check") {
    if (readGraph() !== serialized)
      throw new Error("repository graph is stale; run bun run repository-graph -- generate")
    if (violations.length > 0) throw new Error(violations.join("\n"))
    console.log("repository graph passed")
    return
  }
  if (argument === "violations") {
    printList("violations", violations)
    if (violations.length > 0) process.exitCode = 1
    return
  }
  if (argument === "dependencies" || argument === "users") {
    if (value === undefined) throw new Error(`${argument} requires a file or package`)
    const packageName = packageForArgument(value)
    const result =
      argument === "dependencies"
        ? packageName === undefined
          ? imports.filter((edge) => edge.source === value).map((edge) => edge.package ?? edge.specifier)
          : [...(packageEdges.get(packageName) ?? [])]
        : packageName === undefined
          ? imports.filter((edge) => edge.target === value).map((edge) => edge.source)
          : packageNodes.filter((node) => packageEdges.get(node.name)?.has(packageName)).map((node) => node.name)
    printList(argument, result.toSorted())
    return
  }
  if (argument === "query") {
    if (value === undefined) throw new Error("query requires a path, package, or import substring")
    const matches = [
      ...files.filter((file) => file.includes(value)),
      ...packageNodes.filter((node) => node.name.includes(value) || node.path.includes(value)).map((node) => node.name),
      ...imports
        .filter((edge) => edge.source.includes(value) || edge.specifier.includes(value) || edge.target?.includes(value))
        .map((edge) => `${edge.source} -> ${edge.specifier}`),
    ].toSorted()
    printList("query", [...new Set(matches)])
    return
  }
  if (argument === "tests") {
    if (value === undefined) throw new Error("tests requires a file or package")
    const packageName = packageForArgument(value)
    const result = relationships
      .filter((relationship) =>
        packageName === undefined ? relationship.source === value : ownerOf(relationship.source) === packageName,
      )
      .map((relationship) => relationship.test)
    printList("tests", result.toSorted())
    return
  }
  if (argument === "impact" || argument === "why") {
    if (value === undefined) throw new Error(`${argument} requires a file or package`)
    const packageName = packageForArgument(value)
    const result =
      packageName === undefined
        ? argument === "impact"
          ? imports.filter((edge) => edge.target === value).map((edge) => edge.source)
          : imports
              .filter((edge) => edge.source === value)
              .map((edge) => `${edge.specifier}${edge.target === undefined ? "" : ` -> ${edge.target}`}`)
        : argument === "impact"
          ? imports.filter((edge) => edge.package === packageName).map((edge) => edge.source)
          : [...(packageEdges.get(packageName) ?? [])]
    printList(argument, result.toSorted())
    return
  }
  throw new Error(`unknown repository graph command: ${argument}`)
}
const command = Command.make(
  "repository-graph",
  {
    command: Argument.string("command").pipe(Argument.withDefault("generate")),
    value: Argument.string("value").pipe(Argument.optional),
  },
  ({ command: selected, value: selectedValue }) =>
    Effect.sync(() => run(selected, Option.getOrUndefined(selectedValue))),
)

runMain(Command.run(command, { version: "0.12.0" }).pipe(Effect.provide(layer)))
