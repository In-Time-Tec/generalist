import { layer } from "@effect/platform-bun/BunServices"
import { Config, Console, Effect, Equal, FileSystem, ManagedRuntime, Option, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CryptoHasher, version as bunVersion } from "bun"
import { builtinModules } from "node:module"
import { packageSmokeTypecheck } from "./package-smoke-typecheck.js"
import {
  catalogVersion,
  compressedSizeLimit,
  type ConsumerRuntime,
  exactPackageExports,
  forbiddenPackageExports,
  type MinimumConsumerProfile,
  minimumConsumerProfiles,
  packageDirectory,
  packageName,
  packedEffectDependencies,
  packedProviderDependencies,
  sortRecord,
  tarballName,
  wildcardExportExamples,
  workerSafePackageExports,
} from "./package-smoke-config.js"

class PackageSmokeFailed extends Schema.TaggedError<PackageSmokeFailed>()("generalist/scripts/PackageSmokeFailed", {
  message: Schema.String,
}) {}

const smokeError = (message: string): PackageSmokeFailed => PackageSmokeFailed.make({ message })

const Dependencies = Schema.Record(Schema.String, Schema.String)
const ExportTarget = Schema.Struct({
  types: Schema.optionalKey(Schema.String),
  import: Schema.optionalKey(Schema.String),
})
const PackageManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  private: Schema.optionalKey(Schema.Boolean),
  type: Schema.optionalKey(Schema.String),
  sideEffects: Schema.optionalKey(Schema.Boolean),
  license: Schema.optionalKey(Schema.String),
  files: Schema.optionalKey(Schema.Array(Schema.String)),
  description: Schema.optionalKey(Schema.Json),
  engines: Schema.optionalKey(Schema.Json),
  repository: Schema.optionalKey(Schema.Json),
  homepage: Schema.optionalKey(Schema.Json),
  bugs: Schema.optionalKey(Schema.Json),
  exports: Schema.Record(Schema.String, ExportTarget),
  scripts: Schema.optionalKey(Dependencies),
  dependencies: Schema.optionalKey(Dependencies),
  optionalDependencies: Schema.optionalKey(Dependencies),
  peerDependencies: Schema.optionalKey(Dependencies),
  bundledDependencies: Schema.optionalKey(Schema.Array(Schema.String)),
  bundleDependencies: Schema.optionalKey(Schema.Array(Schema.String)),
})
const RootManifest = Schema.Struct({
  version: Schema.String,
  workspaces: Schema.Struct({
    catalog: Schema.Record(Schema.String, Schema.String),
    catalogs: Schema.optionalKey(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.String))),
  }),
})
const WranglerMetafile = Schema.Struct({
  inputs: Schema.Record(Schema.String, Schema.Unknown),
  outputs: Schema.Record(
    Schema.String,
    Schema.Struct({
      imports: Schema.optionalKey(Schema.Array(Schema.Struct({ path: Schema.String }))),
    }),
  ),
})

const parsePackageManifest = Schema.decodeSync(Schema.fromJsonString(PackageManifest))
const parseRootManifest = Schema.decodeSync(Schema.fromJsonString(RootManifest))
const parseWranglerMetafile = Schema.decodeSync(Schema.fromJsonString(WranglerMetafile))

const encodeJson = (value: Schema.Json): string => Schema.encodeSync(Schema.fromJsonString(Schema.Json))(value)

const sorted = <A>(values: Iterable<A>, compare: (left: A, right: A) => number): Array<A> =>
  Array.from(values).reduce<Array<A>>((result, value) => {
    const index = result.findIndex((item) => compare(value, item) < 0)
    result.splice(index < 0 ? result.length : index, 0, value)
    return result
  }, [])

const run = Effect.fn("PackageSmoke.run")(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env?: Record<string, string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const options: ChildProcess.CommandOptions = env === undefined ? { cwd } : { cwd, env, extendEnv: true }
  const handle = yield* spawner.spawn(ChildProcess.make(command, args, options))
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
    ],
    { concurrency: 3 },
  )
  if (exitCode !== 0) {
    return yield* smokeError(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`)
  }
  return stdout
})

const installedPackages = Effect.fn("PackageSmoke.installedPackages")(function* (
  directory: string,
  dependencies: ReadonlyArray<string>,
) {
  const found: Array<string> = []
  for (const dependency of dependencies) {
    const installed = (yield* run(
      "find",
      ["node_modules", "-path", `*/${dependency}/package.json`, "-print"],
      directory,
    )).trim()
    if (installed.length > 0) found.push(installed)
  }
  return found
})

const runtimeLabel = (runtime: ConsumerRuntime): string => {
  switch (runtime) {
    case "bun":
      return "Bun"
    case "node":
      return "Node/npm"
    case "worker":
      return "Worker/workerd"
  }
}

const profileContext = (
  profile: MinimumConsumerProfile,
  runtime: ConsumerRuntime,
  specifiers: ReadonlyArray<string>,
): string =>
  `[consumer profile ${profile.name}] [runtime ${runtimeLabel(runtime)}] [specifier ${specifiers.join(", ")}]`

const runProfileCommand = Effect.fn("PackageSmoke.runProfileCommand")(function* (input: {
  readonly profile: MinimumConsumerProfile
  readonly runtime: ConsumerRuntime
  readonly specifiers: ReadonlyArray<string>
  readonly command: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly env?: Record<string, string>
}) {
  return yield* run(input.command, input.args, input.cwd, input.env).pipe(
    Effect.mapError((error) =>
      smokeError(
        `${profileContext(input.profile, input.runtime, input.specifiers)} command failed; expected dependency set: ${input.profile.peers.length === 0 ? "effect only" : `effect, ${input.profile.peers.join(", ")}`}\n${error.message}`,
      ),
    ),
  )
})

const profileProbe = (profile: MinimumConsumerProfile, runtime: ConsumerRuntime): string => {
  const probes = profile.imports
    .filter((item) => item.runtimes.includes(runtime))
    .map((item) => ({ specifier: item.specifier, exports: item.exports ?? [] }))
  return `const profile = ${JSON.stringify(profile.name)}
const runtime = ${JSON.stringify(runtimeLabel(runtime))}
const probes = ${JSON.stringify(probes)}
for (const probe of probes) {
  let loaded
  try {
    loaded = await import(probe.specifier)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const missing = message.match(/(?:Cannot find package|Cannot find module|Could not resolve) ['"]([^'"]+)/)?.[1] ?? "unknown"
    throw new Error(\`[consumer profile \${profile}] [runtime \${runtime}] [specifier \${probe.specifier}] missing package \${missing}: \${message}\`)
  }
  for (const name of probe.exports) {
    if (loaded[name] === undefined) {
      throw new Error(\`[consumer profile \${profile}] [runtime \${runtime}] [specifier \${probe.specifier}] expected export \${name} is missing\`)
    }
  }
}
console.log(\`[consumer profile \${profile}] [runtime \${runtime}] imported \${probes.length} specifiers\`)
`
}

const emittedFiles = Effect.fn("PackageSmoke.emittedFiles")(function* (directory: string, extension: ".js" | ".d.ts") {
  const listing = yield* run("find", [directory, "-type", "f", "-name", `*${extension}`, "-print"], directory)
  return sorted(
    listing.split("\n").filter((file) => file.length > 0),
    (left, right) => left.localeCompare(right),
  )
})

const verifyLocalRuntimeGraph = Effect.fn("PackageSmoke.verifyLocalRuntimeGraph")(function* (directory: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const files = yield* emittedFiles(directory, ".js")
  const nodes = new Set(files.map((file) => path.resolve(file)))
  const graph = new Map<string, Array<string>>(Array.from(nodes, (file) => [file, []]))
  const transpiler = new Bun.Transpiler({ loader: "js" })
  let edges = 0
  for (const file of nodes) {
    const imports = transpiler.scanImports(yield* fileSystem.readFileString(file))
    for (const item of imports) {
      if (item.kind !== "import-statement" || !item.path.startsWith(".")) continue
      const target = path.resolve(path.dirname(file), item.path)
      if (!nodes.has(target)) continue
      graph.get(file)!.push(target)
      edges += 1
    }
  }

  let nextIndex = 0
  const indices = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: Array<string> = []
  const onStack = new Set<string>()
  const cycles: Array<Array<string>> = []
  const visit = (node: string): void => {
    indices.set(node, nextIndex)
    lowLinks.set(node, nextIndex)
    nextIndex += 1
    stack.push(node)
    onStack.add(node)
    for (const target of graph.get(node)!) {
      if (!indices.has(target)) {
        visit(target)
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(target)!))
      } else if (onStack.has(target)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(target)!))
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return
    const component: Array<string> = []
    while (true) {
      const member = stack.pop()!
      onStack.delete(member)
      component.push(member)
      if (member === node) break
    }
    if (component.length > 1 || graph.get(node)!.includes(node)) cycles.push(component)
  }
  for (const node of nodes) if (!indices.has(node)) visit(node)
  if (cycles.length > 0) {
    const members = sorted(
      cycles.flatMap((cycle) => cycle.map((file) => path.relative(directory, file))),
      (left, right) => left.localeCompare(right),
    )
    return yield* smokeError(`Generalist emitted runtime graph contains local cycles:\n${members.join("\n")}`)
  }
  yield* Console.log(`${nodes.size} Generalist runtime modules, ${edges} local static edges, 0 cycles`)
})

const verifyDeclarationSpecifiers = Effect.fn("PackageSmoke.verifyDeclarationSpecifiers")(function* (root: string) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const allowed = new Set(
    exactPackageExports.map((specifier) => (specifier === "." ? packageName : `${packageName}${specifier.slice(1)}`)),
  )
  const blocked: Array<string> = []
  const transpiler = new Bun.Transpiler({ loader: "ts" })
  const directory = path.join(root, packageDirectory, "dist")
  for (const file of yield* emittedFiles(directory, ".d.ts")) {
    for (const item of transpiler.scanImports(yield* fileSystem.readFileString(file))) {
      if (item.path !== packageName && !item.path.startsWith(`${packageName}/`)) {
        continue
      }
      if (!allowed.has(item.path)) blocked.push(`${path.relative(root, file)} -> ${item.path}`)
    }
  }
  if (blocked.length > 0) {
    return yield* smokeError(
      `public declarations reference blocked package paths:\n${sorted(blocked, (left, right) => left.localeCompare(right)).join("\n")}`,
    )
  }
})

const verifyWorkerEntrypoints = Effect.fn("PackageSmoke.verifyWorkerEntrypoints")(function* (input: {
  readonly root: string
  readonly consumerDirectory: string
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const workerDirectory = path.join(input.consumerDirectory, "worker-safe")
  const wrangler = path.join(input.root, "examples/cloudflare-worker/node_modules/.bin/wrangler")
  const workerd = path.join(input.root, packageDirectory, "node_modules/.bin/workerd")
  const workerdVersion = (yield* run(workerd, ["--version"], input.root)).trim()
  const workerGroups = [
    {
      name: "neutral",
      specifiers: workerSafePackageExports.filter(
        (specifier) => specifier !== "generalist/ai/openrouter" && specifier !== "generalist/runtime/sql-driver",
      ),
      forbidProviders: true,
      allowSqlRuntime: false,
    },
    {
      name: "sql-driver",
      specifiers: workerSafePackageExports.filter((specifier) => specifier === "generalist/runtime/sql-driver"),
      forbidProviders: true,
      allowSqlRuntime: true,
    },
    {
      name: "openrouter",
      specifiers: workerSafePackageExports.filter((specifier) => specifier === "generalist/ai/openrouter"),
      forbidProviders: false,
      allowSqlRuntime: false,
    },
  ] as const
  const nodeBuiltins = new Set(builtinModules.map((specifier) => specifier.replace(/^node:/, "").split("/")[0]))
  yield* fileSystem.makeDirectory(workerDirectory)
  for (const group of workerGroups) {
    const sourceName = `${group.name}.ts`
    const bundleName = `${group.name}.js`
    const source = group.specifiers
      .map((specifier, index) => `import * as Entry${index} from ${JSON.stringify(specifier)}`)
      .join("\n")
    const entries = group.specifiers.map((_, index) => `Entry${index}`).join(", ")
    yield* fileSystem.writeFileString(
      path.join(workerDirectory, sourceName),
      `${source}
const loaded = [${entries}].map((entry) => Object.keys(entry).length)
if (loaded.some((count) => count === 0)) throw new Error("Worker-safe entrypoint was empty")
export default { test: () => void loaded }
`,
    )
    const wranglerConfig = path.join(workerDirectory, `${group.name}.wrangler.json`)
    const bundleDirectory = path.join(workerDirectory, `${group.name}-out`)
    const metafile = path.join(workerDirectory, `${group.name}.meta.json`)
    yield* fileSystem.writeFileString(
      wranglerConfig,
      encodeJson({
        name: `generalist-worker-safe-${group.name}`,
        main: sourceName,
        compatibility_date: "2026-08-19",
      }),
    )
    yield* run(
      wrangler,
      ["deploy", "--config", wranglerConfig, "--dry-run", "--outdir", bundleDirectory, "--metafile", metafile],
      input.consumerDirectory,
    )
    const metadata = parseWranglerMetafile(yield* fileSystem.readFileString(metafile))
    const graph = new Set<string>(Object.keys(metadata.inputs))
    for (const output of Object.values(metadata.outputs)) {
      for (const item of output.imports ?? []) graph.add(item.path)
    }
    const forbidden = sorted(
      Array.from(graph).filter((item) => {
        const normalized = item.replaceAll("\\", "/").toLowerCase()
        const bare = normalized.replace(/^node:/, "").split("/")[0] ?? normalized
        if (normalized.startsWith("node:") || normalized.startsWith("bun:") || nodeBuiltins.has(bare)) return true
        if (
          [
            "node-built-in-modules:",
            "unenv/runtime/node/",
            "@effect/sql-",
            "@effect+sql-",
            "@aws-sdk",
            "@smithy",
            "bedrock",
            "/client/stdio.",
            "/shared/stdio.",
            "cross-spawn",
            "path-key",
            "/runtime/sqlite-bun.",
            "/repl/bun/",
          ].some((marker) => normalized.includes(marker))
        ) {
          return true
        }
        if (!group.allowSqlRuntime && normalized.includes("/generalist/dist/runtime/sql/")) {
          return (
            !normalized.endsWith("/errors.js") &&
            !normalized.endsWith("/operations.js") &&
            !normalized.endsWith("/codec/codecs.js")
          )
        }
        return group.forbidProviders && (normalized.includes("@effect/ai-") || normalized.includes("@effect+ai-"))
      }),
      (left, right) => left.localeCompare(right),
    )
    if (forbidden.length > 0) {
      return yield* smokeError(
        `${group.name} Worker entrypoints contain forbidden runtime modules:\n${forbidden.join("\n")}`,
      )
    }
    const workerdConfig = path.join(workerDirectory, `${group.name}.capnp`)
    yield* fileSystem.writeFileString(
      workerdConfig,
      `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (services = [(name = "main", worker = .worker)]);
const worker :Workerd.Worker = (
  compatibilityDate = "2026-08-19",
  modules = [(name = ${encodeJson(bundleName)}, esModule = embed ${encodeJson(`${group.name}-out/${bundleName}`)})],
);
`,
    )
    yield* run(workerd, ["test", workerdConfig, "--no-verbose"], workerDirectory)
    yield* Console.log(
      `${group.specifiers.length} ${group.name} Worker-safe entrypoints: ${graph.size} graph entries, 0 forbidden; ${workerdVersion} passed without compatibility flags`,
    )
  }
})

const verifyCloudflareProfile = Effect.fn("PackageSmoke.verifyCloudflareProfile")(function* (input: {
  readonly root: string
  readonly directory: string
  readonly profile: MinimumConsumerProfile
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const runtime = "worker" as const
  const specifiers = input.profile.imports
    .filter((item) => item.runtimes.includes(runtime))
    .map((item) => item.specifier)
  const wrangler = path.join(input.root, "examples/cloudflare-worker/node_modules/.bin/wrangler")
  const workerd = path.join(input.root, packageDirectory, "node_modules/.bin/workerd")
  yield* fileSystem.writeFileString(
    path.join(input.directory, "forbidden-root.mjs"),
    `let blocked = false
try {
  await import("generalist/cloudflare")
} catch (error) {
  blocked = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || error?.code === "ERR_MODULE_NOT_FOUND"
}
if (!blocked) throw new Error("${profileContext(input.profile, runtime, ["generalist/cloudflare"])} unexpected package root export")
`,
  )
  yield* runProfileCommand({
    profile: input.profile,
    runtime,
    specifiers: ["generalist/cloudflare"],
    command: "bun",
    args: ["forbidden-root.mjs"],
    cwd: input.directory,
  })

  const imports = input.profile.imports
    .filter((item) => item.runtimes.includes(runtime))
    .map((item, index) => `import * as Entry${index} from ${JSON.stringify(item.specifier)}`)
    .join("\n")
  const checks = input.profile.imports
    .filter((item) => item.runtimes.includes(runtime))
    .flatMap((item, index) => (item.exports ?? []).map((name) => `[Entry${index}, ${JSON.stringify(name)}]`))
    .join(", ")
  yield* fileSystem.writeFileString(
    path.join(input.directory, "cloudflare.ts"),
    `${imports}
const checks = [${checks}]
if (checks.some(([entry, name]) => entry[name] === undefined)) throw new Error("Cloudflare profile export is missing")
export default { test: () => void checks }
`,
  )
  const wranglerConfig = path.join(input.directory, "wrangler.json")
  const bundleDirectory = path.join(input.directory, "worker-out")
  const metafile = path.join(input.directory, "worker.meta.json")
  yield* fileSystem.writeFileString(
    wranglerConfig,
    encodeJson({
      name: "generalist-cloudflare-package-smoke",
      main: "cloudflare.ts",
      compatibility_date: "2026-08-19",
    }),
  )
  yield* runProfileCommand({
    profile: input.profile,
    runtime,
    specifiers,
    command: wrangler,
    args: ["deploy", "--config", wranglerConfig, "--dry-run", "--outdir", bundleDirectory, "--metafile", metafile],
    cwd: input.directory,
  })
  const metadata = parseWranglerMetafile(yield* fileSystem.readFileString(metafile))
  const graph = new Set<string>(Object.keys(metadata.inputs))
  for (const output of Object.values(metadata.outputs)) {
    for (const item of output.imports ?? []) graph.add(item.path)
  }
  const nodeBuiltins = new Set(builtinModules.map((specifier) => specifier.replace(/^node:/, "").split("/")[0]))
  const forbidden = sorted(
    Array.from(graph).filter((item) => {
      const normalized = item.replaceAll("\\", "/").toLowerCase()
      const bare = normalized.replace(/^node:/, "").split("/")[0] ?? normalized
      return (
        normalized.startsWith("node:") ||
        normalized.startsWith("bun:") ||
        nodeBuiltins.has(bare) ||
        normalized.includes("node-built-in-modules:") ||
        normalized.includes("unenv/runtime/node/")
      )
    }),
    (left, right) => left.localeCompare(right),
  )
  if (forbidden.length > 0) {
    return yield* smokeError(
      `${profileContext(input.profile, runtime, specifiers)} unexpected package or runtime module:\n${forbidden.join("\n")}`,
    )
  }
  yield* fileSystem.writeFileString(
    path.join(input.directory, "worker.capnp"),
    `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (services = [(name = "main", worker = .worker)]);
const worker :Workerd.Worker = (
  compatibilityDate = "2026-08-19",
  modules = [(name = "cloudflare.js", esModule = embed "worker-out/cloudflare.js")],
);
`,
  )
  yield* runProfileCommand({
    profile: input.profile,
    runtime,
    specifiers,
    command: workerd,
    args: ["test", "worker.capnp", "--no-verbose"],
    cwd: input.directory,
  })
  yield* Console.log(
    `${profileContext(input.profile, runtime, specifiers)} ${graph.size} graph entries, 0 forbidden modules`,
  )
})

const validateMinimumConsumerProfiles = Effect.fn("PackageSmoke.validateMinimumConsumerProfiles")(function* (input: {
  readonly manifest: typeof PackageManifest.Type
  readonly packageExports: ReadonlyArray<string>
}) {
  const optionalPeers = Object.keys(input.manifest.peerDependencies ?? {}).filter(
    (dependency) => dependency !== "effect",
  )
  const profiledPeers = new Set(minimumConsumerProfiles.flatMap((profile) => profile.peers))
  for (const dependency of optionalPeers) {
    if (!profiledPeers.has(dependency)) {
      return yield* smokeError(`minimum consumer profile matrix is missing optional peer ${dependency}`)
    }
  }
  for (const profile of minimumConsumerProfiles) {
    for (const dependency of profile.peers) {
      if (!optionalPeers.includes(dependency)) {
        return yield* smokeError(`consumer profile ${profile.name} names undeclared optional peer ${dependency}`)
      }
    }
    for (const item of profile.imports) {
      if (!input.packageExports.includes(item.specifier)) {
        return yield* smokeError(`consumer profile ${profile.name} names unknown package export ${item.specifier}`)
      }
    }
  }
  return optionalPeers
})

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const rootManifest = parseRootManifest(yield* fileSystem.readFileString(path.join(root, "package.json")))
  const version = rootManifest.version
  const validateSourcePackage = Effect.gen(function* () {
    const effectVersion = catalogVersion({ rootManifest, dependency: "effect", reference: "catalog:" })
    if (effectVersion === undefined) return yield* smokeError("root catalog must define effect")
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return yield* smokeError(`root version must be canonical semver: ${version}`)
    }
    const discovered: Array<string> = yield* fileSystem.readDirectory(path.join(root, "packages"))
    discovered.sort()
    if (!Equal.equals(discovered, [packageName])) {
      return yield* smokeError(`public package set mismatch: ${discovered.join(", ")}`)
    }
    const manifestPath = path.join(root, packageDirectory, "package.json")
    const sourceManifest = yield* fileSystem.readFileString(manifestPath)
    const manifest = parsePackageManifest(sourceManifest)
    if (manifest.name !== packageName || manifest.version !== version) {
      return yield* smokeError(`${manifestPath} does not match canonical name/version`)
    }
    if (
      manifest.private !== false ||
      manifest.type !== "module" ||
      manifest.sideEffects !== false ||
      manifest.license !== "MIT" ||
      !Equal.equals(manifest.files, ["dist", "LICENSE", "README.md"])
    ) {
      return yield* smokeError(`${manifestPath} does not match the public MIT-licensed ESM package contract`)
    }
    return { effectVersion, manifestPath, sourceManifest }
  })
  const { effectVersion, manifestPath, sourceManifest } = yield* validateSourcePackage
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-package-smoke-" })
  const configuredArtifactDirectory = yield* Config.option(Config.string("PACKAGE_ARTIFACT_DIR"))
  const tarballDirectory = Option.match(configuredArtifactDirectory, {
    onNone: () => path.join(directory, "packages"),
    onSome: path.resolve,
  })
  const consumerDirectory = path.join(directory, "consumer")
  yield* fileSystem.makeDirectory(tarballDirectory, { recursive: true })
  yield* fileSystem.makeDirectory(consumerDirectory, { recursive: true })

  yield* run("bun", ["run", "build"], root)
  yield* verifyLocalRuntimeGraph(path.join(root, packageDirectory, "dist"))
  yield* verifyDeclarationSpecifiers(root)

  const packAndValidatePackage = Effect.gen(function* () {
    const sourceDirectory = path.join(root, packageDirectory)
    const tarball = path.join(tarballDirectory, tarballName(version))
    yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], sourceDirectory)
    const validateArchive = Effect.gen(function* () {
      const archive = yield* fileSystem.readFile(tarball)
      if (archive.byteLength > compressedSizeLimit) {
        return yield* smokeError(`${packageName} tarball exceeds ${compressedSizeLimit} bytes: ${archive.byteLength}`)
      }
      const listing = yield* run("tar", ["-tzf", tarball], root)
      const entries = listing.split("\n").filter((entry) => entry.length > 0)
      const unexpected = entries.filter(
        (entry) =>
          entry !== "package/" &&
          entry !== "package/package.json" &&
          entry !== "package/LICENSE" &&
          entry !== "package/README.md" &&
          entry !== "package/dist/" &&
          !/^package\/dist\/.+\.(?:js|d\.ts)$/.test(entry),
      )
      if (unexpected.length > 0) {
        return yield* smokeError(`${packageName} contains unexpected files: ${unexpected.join(", ")}`)
      }
      if (entries.some((entry) => entry.startsWith("/") || entry.split("/").includes(".."))) {
        return yield* smokeError(`${packageName} contains an unsafe path`)
      }
      const verboseListing = yield* run("tar", ["-tvzf", tarball], root)
      const unsafeTypes = verboseListing
        .split("\n")
        .filter((entry) => entry.length > 0 && entry[0] !== "-" && entry[0] !== "d")
      if (unsafeTypes.length > 0) {
        return yield* smokeError(`${packageName} contains a non-regular entry`)
      }
      return entries
    })
    const entries = yield* validateArchive
    const manifest = parsePackageManifest(yield* run("tar", ["-xOzf", tarball, "package/package.json"], root))
    const source = parsePackageManifest(sourceManifest)
    const validateManifestIdentity = Effect.gen(function* () {
      if (manifest.name !== packageName || manifest.version !== version) {
        return yield* smokeError(`packed identity mismatch for ${packageName}`)
      }
      if (manifest.peerDependencies?.effect !== effectVersion || manifest.dependencies?.effect !== undefined) {
        return yield* smokeError(`${packageName} must expose Effect only as exact peer`)
      }
      if (/workspace:|catalog:/.test(encodeJson(manifest))) {
        return yield* smokeError(`${packageName} contains an unresolved protocol`)
      }
      for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
        if (manifest.scripts?.[lifecycle] !== undefined) {
          return yield* smokeError(`${packageName} contains the ${lifecycle} lifecycle hook`)
        }
      }
    })
    yield* validateManifestIdentity
    const validateManifestExports = Effect.gen(function* () {
      for (const field of [
        "description",
        "type",
        "sideEffects",
        "license",
        "files",
        "engines",
        "repository",
        "homepage",
        "bugs",
      ] as const) {
        if (!Equal.equals(manifest[field], source[field])) {
          return yield* smokeError(`${packageName} changed its packed ${field} metadata`)
        }
      }
      if (!Equal.equals(manifest.exports, source.exports)) {
        return yield* smokeError(`${packageName} changed its public exports`)
      }
      const actualExports = sorted(Object.keys(manifest.exports), (left, right) => left.localeCompare(right))
      if (!Equal.equals(actualExports, exactPackageExports)) {
        return yield* smokeError(`${packageName} exact exports changed: ${actualExports.join(", ")}`)
      }
      for (const [specifier, target] of Object.entries(manifest.exports)) {
        if (!Equal.equals(Object.keys(target), ["types", "import"])) {
          return yield* smokeError(`${packageName}${specifier} must list types before import`)
        }
        for (const [condition, value] of Object.entries(target)) {
          const expectedExtension = condition === "types" ? ".d.ts" : ".js"
          if (!value.startsWith("./dist/") || !value.endsWith(expectedExtension)) {
            return yield* smokeError(`${packageName}${specifier} has invalid ${condition} target`)
          }
          if (specifier.includes("*")) {
            const wildcardIndex = value.indexOf("*")
            const prefix = value.slice(0, wildcardIndex)
            const suffix = value.slice(wildcardIndex + 1)
            const matches = entries.filter(
              (entry) => entry.startsWith(`package/${prefix.slice(2)}`) && entry.endsWith(suffix),
            )
            if (matches.length === 0) {
              return yield* smokeError(`${packageName}${specifier} resolves to no ${condition} target`)
            }
          } else if (!entries.includes(`package/${value.slice(2)}`)) {
            return yield* smokeError(`${packageName}${specifier} is missing ${value}`)
          }
        }
      }
    })
    yield* validateManifestExports
    const validateManifestDependencies = Effect.gen(function* () {
      for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
        const expected = Object.fromEntries(
          Object.entries(source[section] ?? {}).map(([dependency, dependencyVersion]) => {
            if (dependencyVersion.startsWith("workspace:")) return [dependency, version]
            if (dependencyVersion.startsWith("catalog:")) {
              const resolvedVersion = catalogVersion({ rootManifest, dependency, reference: dependencyVersion })
              if (resolvedVersion === undefined) {
                throw new Error(`${source.name} references missing catalog dependency ${dependency}`)
              }
              return [dependency, resolvedVersion]
            }
            return [dependency, dependencyVersion]
          }),
        )
        if (!Equal.equals(sortRecord(manifest[section]), sortRecord(expected))) {
          return yield* smokeError(`${packageName} changed its packed ${section}`)
        }
      }
      if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
        return yield* smokeError(`${packageName} must not bundle dependencies`)
      }
      for (const dependency of packedEffectDependencies) {
        const dependencyVersion = manifest.peerDependencies?.[dependency]
        if (dependencyVersion !== effectVersion) {
          return yield* smokeError(
            `${packageName} must pin ${dependency}@${effectVersion}; packed ${String(dependencyVersion)}`,
          )
        }
      }
      for (const [dependency, dependencyVersion] of Object.entries(packedProviderDependencies)) {
        if (manifest.peerDependencies?.[dependency] !== dependencyVersion) {
          return yield* smokeError(
            `${packageName} must pin optional peer ${dependency}@${dependencyVersion}; packed ${manifest.peerDependencies?.[dependency]}`,
          )
        }
      }
    })
    yield* validateManifestDependencies
    if ((yield* fileSystem.readFileString(manifestPath)) !== sourceManifest) {
      return yield* smokeError(`packing mutated ${manifestPath}`)
    }
    return { manifest, tarball }
  })
  const { manifest: packedManifest, tarball } = yield* packAndValidatePackage
  const packageTarball = `file:${tarball}`
  const packageExports = sorted(
    [
      ...Object.keys(packedManifest.exports)
        .filter((specifier) => !specifier.includes("*"))
        .map((specifier) => (specifier === "." ? packageName : `${packageName}${specifier.slice(1)}`)),
      ...wildcardExportExamples,
    ],
    (left, right) => left.localeCompare(right),
  )

  const integrationPeers = Object.fromEntries(
    Object.entries(packedManifest.peerDependencies ?? {}).filter(
      ([dependency]) => dependency !== "effect" && dependency !== "foldkit",
    ),
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    encodeJson({
      name: "generalist-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        [packageName]: packageTarball,
        ...integrationPeers,
        effect: effectVersion,
        esbuild: rootManifest.workspaces.catalog.esbuild,
        foldkit: rootManifest.workspaces.catalog.foldkit,
        typescript: rootManifest.workspaces.catalog.typescript,
      },
      /**
       * FoldKit 0.148.2 still declares rc.109, so its targeted override proves the current rc.112
       * runtime instead of disabling peer resolution for the whole consumer.
       */
      overrides: {
        foldkit: { effect: effectVersion },
      },
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "tsconfig.json"),
    encodeJson({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2024",
      },
      include: ["typecheck.ts"],
    }),
  )
  yield* fileSystem.writeFileString(path.join(consumerDirectory, "typecheck.ts"), packageSmokeTypecheck(packageExports))
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "external-child-bundle.ts"),
    `import * as ExternalChildPlacement from "generalist/runtime/external-child-placement"
import { ExternalChildStore } from "generalist/runtime/external-child-store"
console.log(ExternalChildPlacement, ExternalChildStore)
`,
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${encodeJson(packageExports)}
const runtimeSpecifiers = process.versions.bun === undefined
  ? specifiers.filter((specifier) => specifier !== "generalist/runtime/sqlite-bun")
  : specifiers
for (const specifier of runtimeSpecifiers) await import(specifier)
const forbidden = ${encodeJson(forbiddenPackageExports)}
for (const specifier of forbidden) {
  let blocked = false
  try {
    await import(specifier)
  } catch (error) {
    blocked = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED" || error?.code === "ERR_MODULE_NOT_FOUND"
  }
  if (!blocked) throw new Error(\`forbidden package export resolved: \${specifier}\`)
}
const { A2A } = await import("generalist/a2a")
const { AGUI } = await import("generalist/ag-ui")
const { Agent, Memory, ModelMiddleware, ModelRegistry, Session } = await import("generalist")
const { VectorStore } = await import("generalist/memory")
const { State, Store } = await import("generalist/instructions")
const { MCPClient } = await import("generalist/mcp")
const McpHttpClient = await import("generalist/mcp/client/http")
const ModelCatalog = await import("generalist/ai/model-catalog")
const OpenAI = await import("generalist/ai/openai")
const skills = await import("generalist/instructions/skills")
const { TestModel } = await import("generalist/test")
const { Runtime, RunEvent } = await import("generalist/runtime")
const { Snapshot, Wire } = await import("generalist/transport")
const { Config, Effect, Layer, Schema } = await import("effect")
const { Tool, Toolkit } = await import("effect/unstable/ai")
if ("HostedCatalog" in skills) throw new Error("HostedCatalog must remain internal")
for (const value of [
  A2A.layer,
  AGUI.layer,
  State.empty,
  Store.layerMemory,
  Runtime.layerMemory,
  RunEvent.RunEvent,
  Snapshot.get,
  Wire.observerCodec,
]) {
  if (value === undefined) throw new Error("Runtime adapter package export is missing")
}
const tool = Tool.make("identity_proof", { parameters: Schema.Struct({ value: Schema.String }) })
const agent = Agent.make({ name: "identity-proof", toolkit: Toolkit.make(tool) })
const layers = [
  ModelRegistry.layer(),
  Session.layerMemory,
  ModelCatalog.layer(),
  TestModel.layer([TestModel.text("identity")]),
  MCPClient.layer({
    name: "identity",
    transport: McpHttpClient.make({ url: "https://mcp.example/rpc" }),
  }),
]
if (layers.some((value) => !Layer.isLayer(value))) throw new Error("Generalist layer does not use the root Effect identity")
if (!Layer.isLayer(OpenAI.layer({ model: "gpt-4o-mini", apiKey: Config.redacted("OPENAI_API_KEY") }))) {
  throw new Error("provider constructor does not use the root Layer identity")
}
if (!Effect.isEffect(TestModel.make([TestModel.text("identity")]))) {
  throw new Error("TestModel does not use the root Effect identity")
}
console.log(\`imported \${runtimeSpecifiers.length} Generalist exports\`)
`,
  )

  yield* run("bun", ["install", "--linker=isolated"], consumerDirectory, {
    BUN_INSTALL_CACHE_DIR: path.join(directory, "bun-install-cache"),
  })
  const installedEffects = (yield* run(
    "find",
    ["node_modules", "-path", "*/effect/package.json", "-print"],
    consumerDirectory,
  ))
    .trim()
    .split("\n")
    .filter((entry) => entry.length > 0)
  if (installedEffects.length !== 1) {
    return yield* smokeError(
      `consumer installed ${installedEffects.length} Effect copies:\n${installedEffects.join("\n")}`,
    )
  }
  yield* run("bun", ["tsc", "--noEmit"], consumerDirectory)
  yield* run(
    "bun",
    [
      "node_modules/esbuild/bin/esbuild",
      "external-child-bundle.ts",
      "--bundle",
      "--format=esm",
      "--platform=browser",
      "--outfile=external-child-bundle.js",
    ],
    consumerDirectory,
  )
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], consumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "bun", "runtime.mjs"], consumerDirectory)
  if (
    (yield* fileSystem.readFileString(path.join(consumerDirectory, "bun.lock"))).includes("npmjs.org/generalist/-/")
  ) {
    return yield* smokeError("Bun consumer resolved the Generalist package from npm")
  }

  yield* verifyWorkerEntrypoints({ root, consumerDirectory })

  const npmConsumerDirectory = path.join(directory, "npm-consumer")
  yield* fileSystem.makeDirectory(npmConsumerDirectory)
  for (const filename of ["package.json", "tsconfig.json", "typecheck.ts", "runtime.mjs"]) {
    yield* fileSystem.copyFile(path.join(consumerDirectory, filename), path.join(npmConsumerDirectory, filename))
  }
  yield* run("npm", ["install", "--ignore-scripts"], npmConsumerDirectory)
  const npmEffects = (yield* run(
    "find",
    ["node_modules", "-path", "*/effect/package.json", "-print"],
    npmConsumerDirectory,
  ))
    .trim()
    .split("\n")
    .filter(Boolean)
  if (npmEffects.length !== 1) {
    return yield* smokeError(`npm consumer installed ${npmEffects.length} Effect copies`)
  }
  yield* run("npx", ["tsc", "--noEmit"], npmConsumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], npmConsumerDirectory)
  if (
    (yield* fileSystem.readFileString(path.join(npmConsumerDirectory, "package-lock.json"))).includes(
      "npmjs.org/generalist/-/",
    )
  ) {
    return yield* smokeError("npm consumer resolved the Generalist package from npm")
  }

  const optionalPeers = yield* validateMinimumConsumerProfiles({ manifest: packedManifest, packageExports })

  // An optional peer must never be installed on Generalist's behalf when the consumer does not
  // declare it. Only Bun's isolated linker auto-materializes peers, so scope the assertion to the
  // store subtree Bun resolves for the Generalist package itself; a peer that arrives as a real
  // dependency of the consumer's own tooling (for example @standard-schema/spec via vitest) is not
  // a violation.
  const verifyOptionalPeersNotInstalled = Effect.fn("PackageSmoke.verifyOptionalPeersNotInstalled")(function* (
    profile: MinimumConsumerProfile,
    runtime: ConsumerRuntime,
    specifiers: ReadonlyArray<string>,
    profileDirectory: string,
  ) {
    const bunStore = path.join(profileDirectory, "node_modules", ".bun")
    if (!(yield* fileSystem.exists(bunStore))) return
    for (const dependency of optionalPeers) {
      if (profile.peers.includes(dependency)) continue
      const installed = (yield* run(
        "find",
        [bunStore, "-path", `*/${packageName}@*/node_modules/${dependency}/package.json`, "-print"],
        profileDirectory,
      )).trim()
      if (installed.length > 0) {
        return yield* smokeError(
          `${profileContext(profile, runtime, specifiers)} unexpected package ${dependency} installed for ${packageName}:\n${installed}`,
        )
      }
    }
  })

  const verifyRivetDeclarationDependency = Effect.fn("PackageSmoke.verifyRivetDeclarationDependency")(function* (
    profile: MinimumConsumerProfile,
    runtime: ConsumerRuntime,
    specifiers: ReadonlyArray<string>,
    profileDirectory: string,
  ) {
    if (profile.name !== "rivet") return
    if ((yield* installedPackages(profileDirectory, ["@standard-schema/spec"])).length === 0) {
      return yield* smokeError(
        `${profileContext(profile, runtime, specifiers)} missing package @standard-schema/spec required by Rivet declarations`,
      )
    }
  })

  const verifyRivetCommonJsBoundary = Effect.fn("PackageSmoke.verifyRivetCommonJsBoundary")(function* (
    profile: MinimumConsumerProfile,
    runtime: ConsumerRuntime,
    specifiers: ReadonlyArray<string>,
    profileDirectory: string,
  ) {
    if (profile.name !== "rivet" || runtime !== "node") return
    yield* fileSystem.writeFileString(
      path.join(profileDirectory, "require.cjs"),
      `let blocked = false
try {
  require("generalist/rivet/actors")
} catch (error) {
  blocked = error?.code === "ERR_PACKAGE_PATH_NOT_EXPORTED"
}
if (!blocked) throw new Error("generalist/rivet/actors must remain ESM-only")
`,
    )
    yield* runProfileCommand({
      profile,
      runtime,
      specifiers,
      command: "node",
      args: ["require.cjs"],
      cwd: profileDirectory,
    })
  })

  const runMinimumProfile = Effect.fn("PackageSmoke.runMinimumProfile")(function* (
    profile: MinimumConsumerProfile,
    runtime: ConsumerRuntime,
  ) {
    const specifiers = profile.imports.filter((item) => item.runtimes.includes(runtime)).map((item) => item.specifier)
    const profileDirectory = path.join(directory, "profiles", `${profile.name}-${runtime}`)
    yield* fileSystem.makeDirectory(profileDirectory, { recursive: true })
    const peerDependencies: Record<string, string> = {}
    for (const dependency of profile.peers) {
      const dependencyVersion = packedManifest.peerDependencies?.[dependency]
      if (dependencyVersion === undefined) {
        return yield* smokeError(
          `${profileContext(profile, runtime, specifiers)} missing package ${dependency} version`,
        )
      }
      peerDependencies[dependency] = dependencyVersion
    }
    const profileManifest = {
      name: `generalist-package-smoke-${profile.name}-${runtime}`,
      private: true,
      type: "module",
      dependencies: { effect: effectVersion, [packageName]: packageTarball, ...peerDependencies },
      ...(profile.peers.includes("foldkit") && {
        overrides: { foldkit: { effect: effectVersion } },
      }),
    } satisfies Schema.Json
    yield* fileSystem.writeFileString(path.join(profileDirectory, "package.json"), encodeJson(profileManifest))
    if (runtime === "node") {
      yield* runProfileCommand({
        profile,
        runtime,
        specifiers,
        command: "npm",
        args: ["install", "--ignore-scripts"],
        cwd: profileDirectory,
      })
    } else {
      yield* runProfileCommand({
        profile,
        runtime,
        specifiers,
        command: "bun",
        args: ["install", "--linker=isolated"],
        cwd: profileDirectory,
        env: { BUN_INSTALL_CACHE_DIR: path.join(directory, "bun-install-cache") },
      })
    }

    for (const dependency of ["effect", packageName, ...profile.peers]) {
      if ((yield* installedPackages(profileDirectory, [dependency])).length === 0) {
        return yield* smokeError(`${profileContext(profile, runtime, specifiers)} missing package ${dependency}`)
      }
    }
    yield* verifyRivetDeclarationDependency(profile, runtime, specifiers, profileDirectory)
    yield* verifyOptionalPeersNotInstalled(profile, runtime, specifiers, profileDirectory)
    const installedEffectsForProfile = (yield* run(
      "find",
      ["node_modules", "-path", "*/effect/package.json", "-print"],
      profileDirectory,
    ))
      .trim()
      .split("\n")
      .filter(Boolean)
    if (installedEffectsForProfile.length !== 1) {
      return yield* smokeError(
        `${profileContext(profile, runtime, specifiers)} unexpected package effect copies: ${installedEffectsForProfile.length}`,
      )
    }

    if (runtime === "worker") {
      yield* verifyCloudflareProfile({ root, directory: profileDirectory, profile })
    } else {
      yield* fileSystem.writeFileString(path.join(profileDirectory, "probe.mjs"), profileProbe(profile, runtime))
      const output = yield* runProfileCommand({
        profile,
        runtime,
        specifiers,
        command: "env",
        args: ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", runtime, "probe.mjs"],
        cwd: profileDirectory,
      })
      yield* Console.log(output.trim())
    }
    yield* verifyRivetCommonJsBoundary(profile, runtime, specifiers, profileDirectory)

    const lockfile = path.join(profileDirectory, runtime === "node" ? "package-lock.json" : "bun.lock")
    if ((yield* fileSystem.readFileString(lockfile)).includes("npmjs.org/generalist/-/")) {
      return yield* smokeError(
        `${profileContext(profile, runtime, specifiers)} unexpected package source npmjs.org/generalist`,
      )
    }
  })

  const profileRuns = minimumConsumerProfiles.flatMap((profile) =>
    Array.from(new Set<ConsumerRuntime>(profile.imports.flatMap((item) => item.runtimes))).map((runtime) => ({
      profile,
      runtime,
    })),
  )
  yield* Effect.all(
    profileRuns.map(({ profile, runtime }) => runMinimumProfile(profile, runtime)),
    {
      concurrency: 4,
      discard: true,
    },
  )

  const writeReleaseEvidence = Effect.gen(function* () {
    const filename = tarballName(version)
    const archive = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
    const evidencePackage = {
      name: packageName,
      version,
      filename,
      compressedBytes: archive.byteLength,
      unpackedBytes: (yield* run("tar", ["-tvzf", path.join(tarballDirectory, filename)], root))
        .split("\n")
        .filter(Boolean)
        .reduce((total, entry) => total + Number(entry.trim().split(/\s+/)[2]), 0),
      sha256: new CryptoHasher("sha256").update(archive).digest("hex"),
      dependencies: packedManifest.dependencies ?? {},
      peerDependencies: packedManifest.peerDependencies ?? {},
      exports: packedManifest.exports,
    }
    const evidence = {
      schemaVersion: 1,
      sourceCommit: (yield* run("git", ["rev-parse", "HEAD"], root)).trim(),
      tools: {
        bun: bunVersion,
        node: (yield* run("node", ["--version"], root)).trim(),
        typescript: rootManifest.workspaces.catalog.typescript,
      },
      packages: [evidencePackage],
    }
    const evidencePath = path.join(tarballDirectory, "release-evidence.json")
    yield* fileSystem.writeFileString(evidencePath, `${encodeJson(evidence)}\n`)
    const checksums: Array<string> = []
    for (const checksumFile of sorted([filename, "release-evidence.json"], (left, right) =>
      left.localeCompare(right),
    )) {
      const bytes = yield* fileSystem.readFile(path.join(tarballDirectory, checksumFile))
      checksums.push(`${new CryptoHasher("sha256").update(bytes).digest("hex")}  ${checksumFile}`)
    }
    yield* fileSystem.writeFileString(path.join(tarballDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`)
    yield* Console.log(`${evidencePackage.name}: ${evidencePackage.compressedBytes} compressed bytes`)
  })
  yield* writeReleaseEvidence
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program.pipe(Effect.scoped))
