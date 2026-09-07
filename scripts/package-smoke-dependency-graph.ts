import { Array as Arr, Effect, FileSystem, Order, Path, Schema } from "effect"
import { isSqlGraphEntry, type MinimumConsumerProfile, packageName } from "./package-smoke-config.js"

const DependencyManifest = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    dependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    devDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    optionalDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    peerDependencies: Schema.optional(Schema.Record(Schema.String, Schema.String)),
    peerDependenciesMeta: Schema.optional(
      Schema.Record(Schema.String, Schema.Struct({ optional: Schema.optional(Schema.Boolean) })),
    ),
  }),
)

export class DependencyGraphFailed extends Schema.TaggedError<DependencyGraphFailed>()(
  "generalist/scripts/DependencyGraphFailed",
  { message: Schema.String },
) {}

const loadInstalledGraph = Effect.fn("PackageSmoke.loadInstalledGraph")(function* (input: {
  readonly directory: string
  readonly manifests: ReadonlyArray<string>
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fileSystem.realPath(input.directory)
  const manifests = new Map<string, typeof DependencyManifest.Type>()
  for (const filename of input.manifests) {
    const packageDirectory = path.dirname(path.resolve(directory, filename))
    const parent = path.dirname(packageDirectory)
    if (
      path.basename(parent) !== "node_modules" &&
      !(path.basename(parent).startsWith("@") && path.basename(path.dirname(parent)) === "node_modules")
    ) {
      continue
    }
    const canonical = yield* fileSystem.realPath(packageDirectory)
    manifests.set(
      canonical,
      yield* Schema.decodeEffect(DependencyManifest)(
        yield* fileSystem.readFileString(path.join(canonical, "package.json")),
      ),
    )
  }

  const resolve = Effect.fn("PackageSmoke.resolveInstalledDependency")(function* (from: string, name: string) {
    let current = from
    while (current === directory || current.startsWith(`${directory}${path.sep}`)) {
      const candidate = path.join(current, "node_modules", name)
      if (yield* fileSystem.exists(path.join(candidate, "package.json"))) {
        const canonical = yield* fileSystem.realPath(candidate)
        if (manifests.has(canonical)) return canonical
      }
      current = path.dirname(current)
    }
    return undefined
  })
  const consumer = yield* Schema.decodeEffect(DependencyManifest)(
    yield* fileSystem.readFileString(path.join(directory, "package.json")),
  )
  const generalistDirectory = yield* resolve(directory, packageName)
  const generalist = generalistDirectory === undefined ? undefined : manifests.get(generalistDirectory)
  if (generalistDirectory === undefined || generalist === undefined) {
    return yield* DependencyGraphFailed.make({ message: "consumer is missing the installed Generalist manifest" })
  }
  return { directory, manifests, resolve, consumer, generalist, generalistDirectory }
})

type InstalledGraph = Effect.Success<ReturnType<typeof loadInstalledGraph>>

const nativeHostRoots = Effect.fn("PackageSmoke.nativeHostRoots")(function* (
  graph: InstalledGraph,
  profiles: ReadonlyArray<MinimumConsumerProfile>,
) {
  const { directory, consumer, generalist, resolve } = graph
  for (const dependency of Object.keys({
    ...generalist.dependencies,
    ...generalist.optionalDependencies,
    ...generalist.peerDependencies,
  })) {
    if (isSqlGraphEntry(dependency)) {
      return yield* DependencyGraphFailed.make({
        message: `Generalist declares a forbidden SQL dependency: ${dependency}`,
      })
    }
  }

  const nativeRoots = new Set<string>()
  for (const profile of profiles) {
    for (const dependency of profile.nativeHostPeers ?? []) {
      if (
        !profile.peers.includes(dependency) ||
        generalist.peerDependencies?.[dependency] === undefined ||
        generalist.peerDependenciesMeta?.[dependency]?.optional !== true ||
        consumer.dependencies?.[dependency] === undefined
      ) {
        return yield* DependencyGraphFailed.make({
          message: `${profile.name} native host ${dependency} must be an explicitly installed Generalist optional peer`,
        })
      }
      const resolved = yield* resolve(directory, dependency)
      if (resolved === undefined) {
        return yield* DependencyGraphFailed.make({
          message: `${profile.name} native host ${dependency} is not installed`,
        })
      }
      nativeRoots.add(resolved)
    }
  }
  return nativeRoots
})

const isOptionalPeer = (manifest: typeof DependencyManifest.Type, dependency: string): boolean =>
  manifest.peerDependencies?.[dependency] !== undefined &&
  manifest.peerDependenciesMeta?.[dependency]?.optional === true &&
  manifest.dependencies?.[dependency] === undefined &&
  manifest.optionalDependencies?.[dependency] === undefined

const dependencyClosure = Effect.fn("PackageSmoke.dependencyClosure")(function* (
  graph: InstalledGraph,
  roots: ReadonlySet<string>,
) {
  const closure = new Set<string>()
  const queue = [...roots]
  for (const current of queue) {
    if (closure.has(current)) continue
    closure.add(current)
    const manifest = graph.manifests.get(current)
    if (manifest === undefined) continue
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })) {
      const resolved = yield* graph.resolve(current, dependency)
      if (resolved === undefined) continue
      if (current === graph.generalistDirectory && isOptionalPeer(manifest, dependency)) {
        continue
      }
      queue.push(resolved)
    }
  }
  return closure
})

const nativeDependencyClosure = Effect.fn("PackageSmoke.nativeDependencyClosure")(function* (
  graph: InstalledGraph,
  nativeRoots: ReadonlySet<string>,
) {
  const nativeClosure = yield* dependencyClosure(graph, nativeRoots)
  const linkedPeers = new Set<string>()
  for (const directory of nativeClosure) {
    const manifest = graph.manifests.get(directory)
    if (manifest === undefined) continue
    for (const dependency of Object.keys({
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
      ...manifest.peerDependencies,
    })) {
      if (!isOptionalPeer(graph.generalist, dependency)) continue
      const reached = yield* graph.resolve(directory, dependency)
      if (reached === undefined || !nativeClosure.has(reached)) continue
      if (graph.manifests.get(reached)?.name !== dependency) continue
      const peer = yield* graph.resolve(graph.generalistDirectory, dependency)
      if (peer !== undefined && graph.manifests.get(peer)?.name === dependency) linkedPeers.add(peer)
    }
  }
  const linkedClosure = yield* dependencyClosure(graph, linkedPeers)
  return new Set([...nativeClosure, ...linkedClosure])
})

export const auditInstalledDependencyGraph = Effect.fn("PackageSmoke.auditInstalledDependencyGraph")(function* (input: {
  readonly directory: string
  readonly manifests: ReadonlyArray<string>
  readonly profiles: ReadonlyArray<MinimumConsumerProfile>
  readonly forbidAws?: boolean
}) {
  const path = yield* Path.Path
  const graph = yield* loadInstalledGraph(input)
  const nativeRoots = yield* nativeHostRoots(graph, input.profiles)
  const protectedRoots = new Set<string>()
  for (const dependency of Object.keys({
    ...graph.consumer.dependencies,
    ...graph.consumer.optionalDependencies,
    ...graph.consumer.devDependencies,
  })) {
    const resolved = yield* graph.resolve(graph.directory, dependency)
    if (resolved !== undefined && !nativeRoots.has(resolved)) protectedRoots.add(resolved)
  }
  const protectedClosure = yield* dependencyClosure(graph, protectedRoots)
  const nativeClosure = yield* nativeDependencyClosure(graph, nativeRoots)
  const forbidden: Array<string> = []
  const nativeSql: Array<string> = []
  for (const [installedDirectory, manifest] of graph.manifests) {
    const relative = path.relative(graph.directory, installedDirectory)
    if (input.forbidAws === true && (manifest.name.startsWith("@aws-sdk/") || manifest.name.startsWith("@smithy/"))) {
      forbidden.push(relative)
    }
    if (!isSqlGraphEntry(manifest.name)) continue
    if (protectedClosure.has(installedDirectory) || !nativeClosure.has(installedDirectory)) {
      forbidden.push(relative)
    } else {
      nativeSql.push(relative)
    }
  }
  if (forbidden.length > 0) {
    return yield* DependencyGraphFailed.make({
      message: `consumer installed a forbidden dependency graph:\n${Arr.sort(forbidden, Order.String).join("\n")}`,
    })
  }
  return { installedPackages: graph.manifests.size, nativeSql: Arr.sort(nativeSql, Order.String) }
})
