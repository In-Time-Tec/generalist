import { Console, Effect, FileSystem, Option, Path, Schema } from "effect"
import { Argument, Command } from "effect/unstable/cli"

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

class RepositoryGraphFailed extends Schema.TaggedErrorClass<RepositoryGraphFailed>()(
  "@batonfx/scripts/RepositoryGraphFailed",
  { message: Schema.String },
) {}

const graphError = (message: string): RepositoryGraphFailed => RepositoryGraphFailed.make({ message })

const ignored = new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated", ".git"])
const sourceFilePattern = /\.(?:ts|tsx|mts|cts)$/

const parseJson = (text: string): Record<string, any> =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Any)))(text)

const parseJsonArray = (text: string): ReadonlyArray<Record<string, any>> =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Array(Schema.Record(Schema.String, Schema.Any))))(text)

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.UnknownFromJsonString)(value)

function exportSpecifiers(value: unknown): Array<string> {
  if (value === undefined || value === null) return ["."]
  if (typeof value === "string") return ["."]
  if (Array.isArray(value)) return ["."]
  if (typeof value !== "object") return []
  return Object.keys(value).toSorted()
}
const isTest = (path: string): boolean => path.includes("/test/") || /(?:\.test|\.spec)\.[^.]+$/.test(path)

const buildGraph = (root: string, pathService: Path.Path, fileSystem: FileSystem.FileSystem) =>
  Effect.gen(function* () {
    const relativePath = (value: string): string => pathService.relative(root, value).split("\\").join("/")

    const listFiles = (directory: string, pattern: RegExp | undefined) =>
      Effect.gen(function* () {
        const result: Array<string> = []
        const pending: Array<string> = [directory]
        while (pending.length > 0) {
          const current = pending.pop()!
          const entries = yield* fileSystem.readDirectory(current)
          for (const name of entries.toSorted((a, b) => a.localeCompare(b)).toReversed()) {
            if (ignored.has(name)) continue
            const file = pathService.join(current, name)
            const info = yield* fileSystem.stat(file)
            if (info.type === "Directory") {
              pending.push(file)
            } else if (info.type === "File" && (pattern === undefined || pattern.test(name))) {
              result.push(file)
            }
          }
        }
        return result
      })

    const allFiles = yield* listFiles(root, undefined)
    const sourceFiles = yield* listFiles(root, sourceFilePattern)

    const manifestPaths = allFiles.filter((file) => file.endsWith("package.json"))
    const packageNodes: Array<PackageNode> = []
    for (const manifestPath of manifestPaths) {
      const manifest = parseJson(yield* fileSystem.readFileString(manifestPath))
      if (typeof manifest.name !== "string") continue
      const packagePath = pathService.dirname(manifestPath)
      const dependencies = Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.peerDependencies,
      }).toSorted()
      packageNodes.push({
        name: manifest.name,
        path: relativePath(packagePath),
        manifest: relativePath(manifestPath),
        private: manifest.private === true,
        dependencies,
        exports: exportSpecifiers(manifest.exports),
      })
    }
    packageNodes.sort((left, right) => left.name.localeCompare(right.name))

    const packageByName = new Map(packageNodes.map((node) => [node.name, node]))
    const packageByPath = packageNodes.toSorted((left, right) => right.path.length - left.path.length)
    const ownerOf = (value: string): string | undefined => {
      const owner = packageByPath.find((node) => value === node.path || value.startsWith(`${node.path}/`))
      return owner?.name
    }
    const files = sourceFiles.map((file) => relativePath(file)).toSorted()
    const fileSet = new Set(files)
    const resolveSource = (source: string, specifier: string): string | undefined => {
      if (!specifier.startsWith(".")) return undefined
      const base = pathService.resolve(pathService.dirname(source), specifier)
      const candidates = [
        base,
        ...[".ts", ".tsx", ".mts", ".cts"].map((extension) => `${base}${extension}`),
        ...["index.ts", "index.tsx"].map((name) => pathService.join(base, name)),
      ]
      return candidates.map((candidate) => relativePath(candidate)).find((candidate) => fileSet.has(candidate))
    }
    const publicSpecifier = (specifier: string, packageNode: PackageNode): boolean => {
      const suffix = specifier.slice(packageNode.name.length)
      const subpath = suffix.length === 0 ? "." : `.${suffix}`
      return packageNode.exports.includes(subpath)
    }

    const importNodes: Array<ImportNode> = []
    {
      const transpiler = new Bun.Transpiler({ loader: "ts" })
      for (const file of files) {
        const source = pathService.join(root, file)
        const sourceText = yield* fileSystem.readFileString(source)
        for (const found of transpiler.scanImports(sourceText)) {
          const target = resolveSource(source, found.path)
          const packageNode = [...packageByName.values()].find(
            (node) => found.path === node.name || found.path.slice(0, node.name.length + 1) === `${node.name}/`,
          )
          importNodes.push({
            source: file,
            specifier: String(found.path),
            ...(target === undefined ? {} : { target }),
            ...(packageNode === undefined ? {} : { package: packageNode.name }),
          })
        }
      }
    }
    const imports = importNodes
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

    const explicitPath = pathService.join(root, "tooling/repository-graph/test-relationships.json")
    const explicit = parseJsonArray(yield* fileSystem.readFileString(explicitPath)) as ReadonlyArray<TestRelationship>
    const relationships = [...explicit]
      .concat(files.filter(isTest).map((test) => ({ source: test, test, kind: "same-stem" as const })))
      .filter(
        (relationship, index, all) =>
          all.findIndex((candidate) => encodeJson(candidate) === encodeJson(relationship)) === index,
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
          const start = pathService.indexOf(node)
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
        if (packageNode === undefined) return []
        if (edge.specifier.startsWith(`${packageNode.name}/`) !== true) return []
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

    const result: Graph = {
      schemaVersion: 2,
      generatedBy: "Bun.Transpiler.scanImports",
      files: files.map((file) => ({
        path: file,
        ...(ownerOf(file) === undefined ? {} : { package: ownerOf(file) }),
        test: isTest(file),
      })),
      packages: packageNodes,
      imports,
      relationships,
      violations: violations.toSorted(),
    }
    return result
  })

const printList = (title: string, values: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    yield* Console.log(`${title}:`)
    for (const value of values) yield* Console.log(`- ${value}`)
  })

export const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const graph = yield* buildGraph(root, path, fileSystem)
  const graphPath = path.join(root, "tooling/repository-graph/generated/repository-graph.json")
  const serialized = `${encodeJson(graph)}\n`
  const readGraph = () => fileSystem.readFileString(graphPath)
  const packageForArgument = (value: string): string | undefined =>
    graph.packages.some((node) => node.name === value)
      ? value
      : graph.packages.find((node) => node.path === value || node.name === value)?.name
  const packageByName = new Map(graph.packages.map((node) => [node.name, node]))
  const packageEdges = new Map<string, Set<string>>()
  for (const node of graph.packages) {
    const dependencies = node.dependencies.filter((dependency) => packageByName.has(dependency))
    packageEdges.set(node.name, new Set(dependencies))
  }
  for (const edge of graph.imports) {
    const sourcePackage = graph.files.find((file) => file.path === edge.source)?.package
    if (
      sourcePackage !== undefined &&
      edge.package !== undefined &&
      sourcePackage !== edge.package &&
      packageByName.has(edge.package)
    ) {
      packageEdges.get(sourcePackage)?.add(edge.package)
    }
  }
  const ownerOf = (value: string): string | undefined =>
    graph.files.find((file) => file.path === value)?.package ??
    graph.packages
      .toSorted((left, right) => right.path.length - left.path.length)
      .find((node) => value === node.path || value.startsWith(`${node.path}/`))?.name

  return yield* Command.run(
    Command.make(
      "repository-graph",
      {
        command: Argument.string("command").pipe(Argument.withDefault("generate")),
        value: Argument.string("value").pipe(Argument.optional),
      },
      ({ command: selected, value: selectedValue }) =>
        Effect.gen(function* () {
          const value = Option.getOrUndefined(selectedValue)
          const argument = selected
          if (argument === "generate") {
            yield* fileSystem.makeDirectory(path.dirname(graphPath), { recursive: true })
            yield* fileSystem.writeFileString(graphPath, serialized)
            yield* Console.log(
              `repository graph generated (${graph.files.length} files, ${graph.imports.length} imports)`,
            )
            return
          }
          if (argument === "check") {
            const existing = yield* readGraph()
            if (existing !== serialized) {
              return yield* graphError("repository graph is stale; run bun run repository-graph -- generate")
            }
            if (graph.violations.length > 0) return yield* graphError(graph.violations.join("\n"))
            yield* Console.log("repository graph passed")
            return
          }
          if (argument === "violations") {
            yield* printList("violations", graph.violations)
            if (graph.violations.length > 0) process.exitCode = 1
            return
          }
          if (argument === "dependencies" || argument === "users") {
            if (value === undefined) return yield* graphError(`${argument} requires a file or package`)
            const packageName = packageForArgument(value)
            const result =
              argument === "dependencies"
                ? packageName === undefined
                  ? graph.imports.filter((edge) => edge.source === value).map((edge) => edge.package ?? edge.specifier)
                  : [...(packageEdges.get(packageName) ?? [])]
                : packageName === undefined
                  ? graph.imports.filter((edge) => edge.target === value).map((edge) => edge.source)
                  : graph.packages
                      .filter((node) => packageEdges.get(node.name)?.has(packageName))
                      .map((node) => node.name)
            yield* printList(argument, result.toSorted())
            return
          }
          if (argument === "query") {
            if (value === undefined) return yield* graphError("query requires a path, package, or import substring")
            const matches = [
              ...graph.files.map((file) => file.path).filter((file) => file.includes(value)),
              ...graph.packages
                .filter((node) => node.name.includes(value) || node.path.includes(value))
                .map((node) => node.name),
              ...graph.imports
                .filter(
                  (edge) =>
                    edge.source.includes(value) || edge.specifier.includes(value) || edge.target?.includes(value),
                )
                .map((edge) => `${edge.source} -> ${edge.specifier}`),
            ].toSorted()
            yield* printList("query", [...new Set(matches)])
            return
          }
          if (argument === "tests") {
            if (value === undefined) return yield* graphError("tests requires a file or package")
            const packageName = packageForArgument(value)
            const result = graph.relationships
              .filter((relationship) =>
                packageName === undefined
                  ? relationship.source === value
                  : ownerOf(relationship.source) === packageName,
              )
              .map((relationship) => relationship.test)
            yield* printList("tests", result.toSorted())
            return
          }
          if (argument === "impact" || argument === "why") {
            if (value === undefined) return yield* graphError(`${argument} requires a file or package`)
            const packageName = packageForArgument(value)
            const result =
              packageName === undefined
                ? argument === "impact"
                  ? graph.imports.filter((edge) => edge.target === value).map((edge) => edge.source)
                  : graph.imports
                      .filter((edge) => edge.source === value)
                      .map((edge) => `${edge.specifier}${edge.target === undefined ? "" : ` -> ${edge.target}`}`)
                : argument === "impact"
                  ? graph.imports.filter((edge) => edge.package === packageName).map((edge) => edge.source)
                  : [...(packageEdges.get(packageName) ?? [])]
            yield* printList(argument, result.toSorted())
            return
          }
          return yield* graphError(`unknown repository graph command: ${argument}`)
        }),
    ),
    { version: "0.13.0" },
  )
})
