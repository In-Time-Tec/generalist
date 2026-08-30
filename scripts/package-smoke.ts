import { layer } from "@effect/platform-bun/BunServices"
import { Config, Console, Effect, Equal, FileSystem, ManagedRuntime, Option, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { CryptoHasher, version as bunVersion } from "bun"
import { builtinModules } from "node:module"
import { packageSmokeTypecheck } from "./package-smoke-typecheck.js"
import {
  catalogVersion,
  compressedSizeLimits,
  forbiddenPackageExports,
  packedEffectDependencies,
  packedProviderDependencies,
  packages,
  packageNames,
  sortRecord,
  tarballName,
  wildcardExportExamples,
  workerSafePackageExports,
} from "./package-smoke-config.js"

class PackageSmokeFailed extends Schema.TaggedError<PackageSmokeFailed>()("@tenetkit/scripts/PackageSmokeFailed", {
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

const verifyWorkerEntrypoints = Effect.fn("PackageSmoke.verifyWorkerEntrypoints")(function* (input: {
  readonly root: string
  readonly consumerDirectory: string
}) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const workerDirectory = path.join(input.consumerDirectory, "worker-safe")
  const wrangler = path.join(input.root, "examples/cloudflare-worker/node_modules/.bin/wrangler")
  const workerd = path.join(input.root, "packages/cloudflare/node_modules/.bin/workerd")
  const workerdVersion = (yield* run(workerd, ["--version"], input.root)).trim()
  const workerGroups = [
    {
      name: "neutral",
      specifiers: workerSafePackageExports.filter((specifier) => specifier !== "tenetkit/ai/openrouter"),
      forbidProviders: true,
    },
    { name: "openrouter", specifiers: ["tenetkit/ai/openrouter"], forbidProviders: false },
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
        name: `tenetkit-worker-safe-${group.name}`,
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
        if (normalized.includes("/tenetkit/dist/runtime/sql/")) {
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

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const rootManifest = parseRootManifest(yield* fileSystem.readFileString(path.join(root, "package.json")))
  const version = rootManifest.version
  const validateSourcePackages = Effect.gen(function* () {
    const effectVersion = catalogVersion({ rootManifest, dependency: "effect", reference: "catalog:" })
    if (effectVersion === undefined) return yield* smokeError("root catalog must define effect")
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      return yield* smokeError(`root version must be canonical semver: ${version}`)
    }
    const discovered: Array<string> = yield* fileSystem.readDirectory(path.join(root, "packages"))
    discovered.sort()
    const expectedPackages: Array<string> = [...packages]
    expectedPackages.sort()
    if (!Equal.equals(discovered, expectedPackages)) {
      return yield* smokeError(`public package set mismatch: ${discovered.join(", ")}`)
    }
    const sourceManifests = new Map<string, string>()
    for (const packageName of packages) {
      const manifestPath = path.join(root, "packages", packageName, "package.json")
      const source = yield* fileSystem.readFileString(manifestPath)
      const manifest = parsePackageManifest(source)
      if (manifest.name !== packageNames[packageName] || manifest.version !== version) {
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
      sourceManifests.set(manifestPath, source)
    }
    return { effectVersion, sourceManifests }
  })
  const { effectVersion, sourceManifests } = yield* validateSourcePackages
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "tenetkit-package-smoke-" })
  const configuredArtifactDirectory = yield* Config.option(Config.string("PACKAGE_ARTIFACT_DIR"))
  const tarballDirectory = Option.match(configuredArtifactDirectory, {
    onNone: () => path.join(directory, "packages"),
    onSome: path.resolve,
  })
  const consumerDirectory = path.join(directory, "consumer")
  yield* fileSystem.makeDirectory(tarballDirectory, { recursive: true })
  yield* fileSystem.makeDirectory(consumerDirectory, { recursive: true })

  yield* run("bun", ["run", "build"], root)

  const packAndValidatePackages = Effect.gen(function* () {
    const tarballs: Record<string, string> = {}
    const packedManifests: Record<string, typeof PackageManifest.Type> = {}
    for (const packageName of packages) {
      const packPackage = Effect.gen(function* () {
        const packageDirectory = path.join(root, "packages", packageName)
        const tarball = path.join(tarballDirectory, tarballName({ packageName, version }))
        yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], packageDirectory)
        const validateArchive = Effect.gen(function* () {
          const archive = yield* fileSystem.readFile(tarball)
          if (archive.byteLength > compressedSizeLimits[packageName]) {
            return yield* smokeError(
              `@tenetkit/${packageName} tarball exceeds ${compressedSizeLimits[packageName]} bytes: ${archive.byteLength}`,
            )
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
            return yield* smokeError(`@tenetkit/${packageName} contains unexpected files: ${unexpected.join(", ")}`)
          }
          if (entries.some((entry) => entry.startsWith("/") || entry.split("/").includes(".."))) {
            return yield* smokeError(`@tenetkit/${packageName} contains an unsafe path`)
          }
          const verboseListing = yield* run("tar", ["-tvzf", tarball], root)
          const unsafeTypes = verboseListing
            .split("\n")
            .filter((entry) => entry.length > 0 && entry[0] !== "-" && entry[0] !== "d")
          if (unsafeTypes.length > 0) {
            return yield* smokeError(`@tenetkit/${packageName} contains a non-regular entry`)
          }
          return entries
        })
        const entries = yield* validateArchive
        const manifest = parsePackageManifest(yield* run("tar", ["-xOzf", tarball, "package/package.json"], root))
        const validateManifestIdentity = Effect.gen(function* () {
          if (manifest.name !== packageNames[packageName] || manifest.version !== version) {
            return yield* smokeError(`packed identity mismatch for ${packageName}`)
          }
          if (manifest.peerDependencies?.effect !== effectVersion || manifest.dependencies?.effect !== undefined) {
            return yield* smokeError(`@tenetkit/${packageName} must expose Effect only as exact peer`)
          }
          if (/workspace:|catalog:/.test(encodeJson(manifest))) {
            return yield* smokeError(`@tenetkit/${packageName} contains an unresolved protocol`)
          }
          for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
            if (manifest.scripts?.[lifecycle] !== undefined) {
              return yield* smokeError(`@tenetkit/${packageName} contains the ${lifecycle} lifecycle hook`)
            }
          }
          const sourceManifestText = sourceManifests.get(path.join(packageDirectory, "package.json"))
          if (sourceManifestText === undefined) {
            return yield* smokeError(`source manifest missing for ${packageName}`)
          }
          const sourceManifest = parsePackageManifest(sourceManifestText)
          return sourceManifest
        })
        const sourceManifest = yield* validateManifestIdentity
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
            if (!Equal.equals(manifest[field], sourceManifest[field])) {
              return yield* smokeError(`@tenetkit/${packageName} changed its packed ${field} metadata`)
            }
          }
          if (!Equal.equals(manifest.exports, sourceManifest.exports)) {
            return yield* smokeError(`@tenetkit/${packageName} changed its public exports`)
          }
          for (const [specifier, target] of Object.entries(manifest.exports)) {
            if (!Equal.equals(Object.keys(target), ["types", "import"])) {
              return yield* smokeError(`@tenetkit/${packageName}${specifier} must list types before import`)
            }
            for (const [condition, value] of Object.entries(target)) {
              const expectedExtension = condition === "types" ? ".d.ts" : ".js"
              if (!value.startsWith("./dist/") || !value.endsWith(expectedExtension)) {
                return yield* smokeError(`@tenetkit/${packageName}${specifier} has invalid ${condition} target`)
              }
              if (specifier.includes("*")) {
                const wildcardIndex = value.indexOf("*")
                const prefix = value.slice(0, wildcardIndex)
                const suffix = value.slice(wildcardIndex + 1)
                const matches = entries.filter(
                  (entry) => entry.startsWith(`package/${prefix.slice(2)}`) && entry.endsWith(suffix),
                )
                if (matches.length === 0) {
                  return yield* smokeError(`@tenetkit/${packageName}${specifier} resolves to no ${condition} target`)
                }
              } else if (!entries.includes(`package/${value.slice(2)}`)) {
                return yield* smokeError(`@tenetkit/${packageName}${specifier} is missing ${value}`)
              }
            }
          }
        })
        yield* validateManifestExports
        const validateManifestDependencies = Effect.gen(function* () {
          const validateDependencySections = Effect.gen(function* () {
            for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
              const expected = Object.fromEntries(
                Object.entries(sourceManifest[section] ?? {}).map(([dependency, dependencyVersion]) => {
                  if (dependencyVersion.startsWith("workspace:")) return [dependency, version]
                  if (dependencyVersion.startsWith("catalog:")) {
                    const resolvedVersion = catalogVersion({ rootManifest, dependency, reference: dependencyVersion })
                    if (resolvedVersion === undefined) {
                      throw new Error(`${sourceManifest.name} references missing catalog dependency ${dependency}`)
                    }
                    return [dependency, resolvedVersion]
                  }
                  return [dependency, dependencyVersion]
                }),
              )
              if (!Equal.equals(sortRecord(manifest[section]), sortRecord(expected))) {
                return yield* smokeError(`@tenetkit/${packageName} changed its packed ${section}`)
              }
              for (const [dependency, dependencyVersion] of Object.entries(manifest[section] ?? {})) {
                if (
                  (dependency === "tenetkit" || dependency.startsWith("@tenetkit/")) &&
                  dependencyVersion !== version
                ) {
                  return yield* smokeError(
                    `@tenetkit/${packageName} must pin ${dependency}@${version}; packed ${dependencyVersion}`,
                  )
                }
              }
            }
          })
          yield* validateDependencySections
          if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
            return yield* smokeError(`@tenetkit/${packageName} must not bundle dependencies`)
          }
          for (const dependency of packedEffectDependencies[packageName]) {
            const dependencyVersion =
              packageName === "tenetkit" ? manifest.peerDependencies?.[dependency] : manifest.dependencies?.[dependency]
            if (dependencyVersion !== effectVersion) {
              return yield* smokeError(
                `@tenetkit/${packageName} must pin ${dependency}@${effectVersion}; packed ${String(dependencyVersion)}`,
              )
            }
          }
          if (packageName === "tenetkit") {
            for (const [dependency, dependencyVersion] of Object.entries(packedProviderDependencies)) {
              if (manifest.peerDependencies?.[dependency] !== dependencyVersion) {
                return yield* smokeError(
                  `tenetkit must pin optional peer ${dependency}@${dependencyVersion}; packed ${manifest.peerDependencies?.[dependency]}`,
                )
              }
            }
          }
        })
        yield* validateManifestDependencies
        return { manifest, tarball }
      })
      const { manifest, tarball } = yield* packPackage
      packedManifests[manifest.name] = manifest
      tarballs[packageNames[packageName]] = `file:${tarball}`
    }

    for (const [manifestPath, source] of sourceManifests) {
      if ((yield* fileSystem.readFileString(manifestPath)) !== source) {
        return yield* smokeError(`packing mutated ${manifestPath}`)
      }
    }
    return { packedManifests, tarballs }
  })
  const { packedManifests, tarballs } = yield* packAndValidatePackages
  const packageExports = sorted(
    [
      ...Object.values(packedManifests).flatMap((manifest) =>
        Object.keys(manifest.exports)
          .filter((specifier) => !specifier.includes("*"))
          .map((specifier) => (specifier === "." ? manifest.name : `${manifest.name}${specifier.slice(1)}`)),
      ),
      ...wildcardExportExamples,
    ],
    (left, right) => left.localeCompare(right),
  )

  const integrationPeers = Object.fromEntries(
    Object.entries(packedManifests.tenetkit?.peerDependencies ?? {}).filter(
      ([dependency]) => dependency !== "effect" && dependency !== "foldkit",
    ),
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    encodeJson({
      name: "tenetkit-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        ...tarballs,
        ...integrationPeers,
        effect: effectVersion,
        esbuild: rootManifest.workspaces.catalog.esbuild,
        foldkit: rootManifest.workspaces.catalog.foldkit,
        typescript: rootManifest.workspaces.catalog.typescript,
      },
      /**
       * The driver packages depend on an exact `tenetkit` version that only exists once this
       * release is published, and an unscoped name cannot be pointed at the local registry the way
       * `@tenetkit:registry` can. Overriding it to the packed tarball resolves the transitive
       * dependency without redirecting every unrelated package through a stub server.
       */
      overrides: { tenetkit: tarballs["tenetkit"] },
      resolutions: { tenetkit: tarballs["tenetkit"] },
    }),
  )
  const registryDirectory = path.join(directory, "registry")
  yield* fileSystem.makeDirectory(registryDirectory)
  yield* fileSystem.writeFileString(
    path.join(registryDirectory, "data.json"),
    encodeJson({ version, tarballDirectory, manifests: packedManifests }),
  )
  yield* fileSystem.writeFileString(
    path.join(registryDirectory, "server.mjs"),
    `import { createReadStream, readFileSync, statSync } from "node:fs"
import { createServer } from "node:http"
import { basename, join } from "node:path"
const { manifests, tarballDirectory, version } = JSON.parse(readFileSync(new URL("./data.json", import.meta.url)))
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://registry").pathname)
  if (pathname.startsWith("/tarballs/")) {
    const file = join(tarballDirectory, basename(pathname))
    response.writeHead(200, { "content-type": "application/octet-stream", "content-length": statSync(file).size })
    createReadStream(file).pipe(response)
    return
  }
  const name = pathname.slice(1)
  const manifest = manifests[name]
  if (manifest === undefined) {
    response.writeHead(404).end("not found")
    return
  }
  const packagePart = name === "tenetkit" ? "tenetkit" : name.slice("@tenetkit/".length)
  const filename = packagePart === "tenetkit" ? \`tenetkit-\${version}.tgz\` : \`tenetkit-\${packagePart}-\${version}.tgz\`
  const body = JSON.stringify({
    name,
    "dist-tags": { latest: version },
    versions: { [version]: { ...manifest, dist: { tarball: \`\${origin}/tarballs/\${filename}\` } } },
  })
  response.writeHead(200, { "content-type": "application/json", "content-length": Buffer.byteLength(body) }).end(body)
})
let origin
server.listen(0, "127.0.0.1", () => {
  origin = \`http://127.0.0.1:\${server.address().port}\`
  console.log(origin)
})
`,
  )
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const registry = yield* spawner.spawn(ChildProcess.make("node", ["server.mjs"], { cwd: registryDirectory }))
  yield* Effect.addFinalizer(() => Effect.orDie(registry.kill()))
  const registryOrigin = yield* Stream.runHead(Stream.splitLines(Stream.decodeText(registry.stdout))).pipe(
    Effect.flatMap(Option.match({ onNone: () => smokeError("local registry did not start"), onSome: Effect.succeed })),
  )
  yield* fileSystem.writeFileString(path.join(consumerDirectory, ".npmrc"), `@tenetkit:registry=${registryOrigin}\n`)
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
    `import * as ExternalChildPlacement from "tenetkit/runtime/external-child-placement"
import { ExternalChildStore } from "tenetkit/runtime/external-child-store"
console.log(ExternalChildPlacement, ExternalChildStore)
`,
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${encodeJson(packageExports)}
const runtimeSpecifiers = process.versions.bun === undefined
  ? specifiers.filter((specifier) => specifier !== "tenetkit/runtime/sqlite-bun")
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
const { A2A } = await import("tenetkit/a2a")
const { AGUI } = await import("tenetkit/ag-ui")
const { Agent, Memory, ModelMiddleware, ModelRegistry, Session } = await import("tenetkit")
const { VectorStore } = await import("tenetkit/memory")
const { State, Store } = await import("tenetkit/agent-guidance")
const { MCPClient } = await import("tenetkit/mcp")
const McpHttpClient = await import("tenetkit/mcp/client/http")
const { ModelCatalog } = await import("tenetkit/ai")
const OpenAI = await import("tenetkit/ai/openai")
const skills = await import("tenetkit/skills")
const { TestModel } = await import("tenetkit/test")
const { Runtime, RunEvent } = await import("tenetkit/runtime")
const { Snapshot, Wire } = await import("tenetkit/transport")
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
if (layers.some((value) => !Layer.isLayer(value))) throw new Error("TenetKit layer does not use the root Effect identity")
if (!Layer.isLayer(OpenAI.layer({ model: "gpt-4o-mini", apiKey: Config.redacted("OPENAI_API_KEY") }))) {
  throw new Error("provider constructor does not use the root Layer identity")
}
if (!Effect.isEffect(TestModel.make([TestModel.text("identity")]))) {
  throw new Error("TestModel does not use the root Effect identity")
}
console.log(\`imported \${runtimeSpecifiers.length} TenetKit exports\`)
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
  if ((yield* fileSystem.readFileString(path.join(consumerDirectory, "bun.lock"))).includes("npmjs.org/@tenetkit")) {
    return yield* smokeError("Bun consumer resolved a TenetKit package from npm")
  }

  yield* verifyWorkerEntrypoints({ root, consumerDirectory })

  const coreConsumerDirectory = path.join(directory, "core-consumer")
  yield* fileSystem.makeDirectory(coreConsumerDirectory)
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "package.json"),
    encodeJson({
      name: "tenetkit-core-consumer",
      private: true,
      type: "module",
      dependencies: {
        effect: effectVersion,
        esbuild: rootManifest.workspaces.catalog.esbuild,
        tenetkit: tarballs.tenetkit,
        typescript: rootManifest.workspaces.catalog.typescript,
        "@types/node": rootManifest.workspaces.catalog["@types/node"],
      },
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "runtime.mjs"),
    `import { Agent, Session } from "tenetkit"
import { Runtime } from "tenetkit/runtime"
import { ModelCatalog, Deterministic, ModelRoute } from "tenetkit/ai"
if (Agent === undefined || Session === undefined) throw new Error("core export is missing")
if (Runtime.layerMemory === undefined) throw new Error("generic Runtime export is missing")
if (ModelCatalog === undefined || Deterministic === undefined || ModelRoute === undefined) throw new Error("neutral AI export is missing")
`,
  )
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "typecheck.ts"),
    `import { ModelCatalog, Deterministic, ModelRoute } from "tenetkit/ai"
import { make } from "tenetkit/ai/model-route"
void [ModelCatalog, Deterministic, ModelRoute, make]
`,
  )
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "tsconfig.json"),
    encodeJson({
      compilerOptions: {
        strict: true,
        skipLibCheck: false,
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        types: ["node"],
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2024",
      },
      include: ["typecheck.ts"],
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "root-bundle.ts"),
    `import { Agent, Session } from "tenetkit"
console.log(Agent, Session)
`,
  )
  yield* fileSystem.writeFileString(
    path.join(coreConsumerDirectory, "runtime-bundle.ts"),
    `import { Runtime } from "tenetkit/runtime"
console.log(Runtime.layerMemory)
`,
  )
  yield* run("bun", ["install", "--linker=isolated"], coreConsumerDirectory, {
    BUN_INSTALL_CACHE_DIR: path.join(directory, "bun-install-cache"),
  })
  const unexpectedIntegrations = (yield* run(
    "find",
    ["node_modules", "-path", "*/@effect/ai-anthropic/package.json", "-print"],
    coreConsumerDirectory,
  )).trim()
  if (unexpectedIntegrations.length > 0) {
    return yield* smokeError(`core-only consumer installed optional provider SDKs:\n${unexpectedIntegrations}`)
  }
  const unexpectedSqlite = (yield* run(
    "find",
    ["node_modules", "-path", "*/@effect/sql-sqlite-bun/package.json", "-print"],
    coreConsumerDirectory,
  )).trim()
  if (unexpectedSqlite.length > 0) {
    return yield* smokeError(`generic Runtime consumer installed the optional SQLite peer:\n${unexpectedSqlite}`)
  }
  for (const entry of ["root", "runtime"]) {
    yield* run(
      "bun",
      [
        "node_modules/esbuild/bin/esbuild",
        `${entry}-bundle.ts`,
        "--bundle",
        "--format=esm",
        "--platform=node",
        `--outfile=${entry}-bundle.js`,
      ],
      coreConsumerDirectory,
    )
  }
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], coreConsumerDirectory)
  yield* run("bun", ["tsc", "--noEmit"], coreConsumerDirectory)

  const openRouterConsumerDirectory = path.join(directory, "openrouter-consumer")
  yield* fileSystem.makeDirectory(openRouterConsumerDirectory)
  yield* fileSystem.writeFileString(
    path.join(openRouterConsumerDirectory, "package.json"),
    encodeJson({
      name: "tenetkit-openrouter-consumer",
      private: true,
      type: "module",
      dependencies: {
        "@effect/ai-openrouter": rootManifest.workspaces.catalog["@effect/ai-openrouter"],
        "@types/node": rootManifest.workspaces.catalog["@types/node"],
        effect: effectVersion,
        tenetkit: tarballs.tenetkit,
        typescript: rootManifest.workspaces.catalog.typescript,
      },
    }),
  )
  yield* fileSystem.writeFileString(
    path.join(openRouterConsumerDirectory, "proof.ts"),
    `import { layer, type ClientOptions } from "tenetkit/ai/openrouter"
const options = null as unknown as ClientOptions
void [layer, options]
`,
  )
  yield* fileSystem.writeFileString(
    path.join(openRouterConsumerDirectory, "tsconfig.json"),
    encodeJson({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        types: ["node"],
        noEmit: true,
        module: "NodeNext",
        moduleResolution: "NodeNext",
        target: "ES2024",
      },
      include: ["proof.ts"],
    }),
  )
  yield* run("bun", ["install", "--linker=isolated"], openRouterConsumerDirectory, {
    BUN_INSTALL_CACHE_DIR: path.join(directory, "bun-install-cache"),
  })
  yield* run("bun", ["tsc", "--noEmit"], openRouterConsumerDirectory)
  yield* run(
    "env",
    [
      "-u",
      "NODE_PATH",
      "-u",
      "NODE_OPTIONS",
      "node",
      "--input-type=module",
      "-e",
      'await import("tenetkit/ai/openrouter")',
    ],
    openRouterConsumerDirectory,
  )

  const npmConsumerDirectory = path.join(directory, "npm-consumer")
  yield* fileSystem.makeDirectory(npmConsumerDirectory)
  for (const filename of ["package.json", "tsconfig.json", "typecheck.ts", "runtime.mjs", ".npmrc"]) {
    yield* fileSystem.copyFile(path.join(consumerDirectory, filename), path.join(npmConsumerDirectory, filename))
  }
  yield* run("npm", ["install", "--ignore-scripts", "--legacy-peer-deps"], npmConsumerDirectory)
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
      "npmjs.org/@tenetkit",
    )
  ) {
    return yield* smokeError("npm consumer resolved a TenetKit package from npm")
  }

  const writeReleaseEvidence = Effect.gen(function* () {
    const evidencePackages: Array<{
      readonly name: string
      readonly version: string
      readonly filename: string
      readonly compressedBytes: number
      readonly unpackedBytes: number
      readonly sha256: string
      readonly dependencies: Readonly<Record<string, string>>
      readonly peerDependencies: Readonly<Record<string, string>>
      readonly exports: Readonly<Record<string, typeof ExportTarget.Type>>
    }> = []
    for (const packageName of packages) {
      const filename = tarballName({ packageName, version })
      const archive = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
      const manifest = parsePackageManifest(
        yield* run("tar", ["-xOzf", path.join(tarballDirectory, filename), "package/package.json"], root),
      )
      evidencePackages.push({
        name: manifest.name,
        version,
        filename,
        compressedBytes: archive.byteLength,
        unpackedBytes: (yield* run("tar", ["-tvzf", path.join(tarballDirectory, filename)], root))
          .split("\n")
          .filter(Boolean)
          .reduce((total, entry) => total + Number(entry.trim().split(/\s+/)[2]), 0),
        sha256: new CryptoHasher("sha256").update(archive).digest("hex"),
        dependencies: manifest.dependencies ?? {},
        peerDependencies: manifest.peerDependencies ?? {},
        exports: manifest.exports,
      })
    }
    const evidence = {
      schemaVersion: 1,
      sourceCommit: (yield* run("git", ["rev-parse", "HEAD"], root)).trim(),
      tools: {
        bun: bunVersion,
        node: (yield* run("node", ["--version"], root)).trim(),
        typescript: rootManifest.workspaces.catalog.typescript,
      },
      packages: sorted(evidencePackages, (left, right) => left.name.localeCompare(right.name)),
    }
    const evidencePath = path.join(tarballDirectory, "release-evidence.json")
    yield* fileSystem.writeFileString(evidencePath, `${encodeJson(evidence)}\n`)
    const checksumFiles = sorted(
      [...evidencePackages.map(({ filename }) => filename), "release-evidence.json"],
      (left, right) => left.localeCompare(right),
    )
    const checksums: Array<string> = []
    for (const filename of checksumFiles) {
      const bytes = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
      checksums.push(`${new CryptoHasher("sha256").update(bytes).digest("hex")}  ${filename}`)
    }
    yield* fileSystem.writeFileString(path.join(tarballDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`)
    for (const item of evidencePackages) yield* Console.log(`${item.name}: ${item.compressedBytes} compressed bytes`)
  })
  yield* writeReleaseEvidence
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program.pipe(Effect.scoped))
