import { layer } from "@effect/platform-bun/BunServices"
import { Config, Console, Effect, Equal, FileSystem, ManagedRuntime, Option, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { packageSmokeTypecheck } from "./package-smoke-typecheck.js"
import {
  catalogVersion,
  compressedSizeLimits,
  forbiddenPackageExports,
  packageExports,
  packedEffectDependencies,
  packedProviderDependencies,
  packages,
  packageNames,
  sortRecord,
  tarballName,
} from "./package-smoke-config.js"

class PackageSmokeFailed extends Schema.TaggedError<PackageSmokeFailed>()("@tenetkit/scripts/PackageSmokeFailed", {
  message: Schema.String,
}) {}

const smokeError = (message: string): PackageSmokeFailed => PackageSmokeFailed.make({ message })

const parseJson = (text: string): Record<string, any> =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Any)))(text)

const encodeJson = (value: unknown): string => Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(value)

const run = Effect.fn("PackageSmoke.run")(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env?: Record<string, string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make(command, args, { cwd, ...(env === undefined ? {} : { env, extendEnv: true }) }),
  )
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

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const rootManifest = parseJson(yield* fileSystem.readFileString(path.join(root, "package.json")))
  const version = rootManifest.version as string
  const effectVersion = catalogVersion({ rootManifest, dependency: "effect", reference: "catalog:" })
  if (effectVersion === undefined) {
    return yield* smokeError("root catalog must define effect")
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return yield* smokeError(`root version must be canonical semver: ${version}`)
  }
  const discovered = (yield* fileSystem.readDirectory(path.join(root, "packages"))).toSorted()
  if (!Equal.equals(discovered, packages.toSorted())) {
    return yield* smokeError(`public package set mismatch: ${discovered.join(", ")}`)
  }
  const sourceManifests = new Map<string, string>()
  for (const packageName of packages) {
    const manifestPath = path.join(root, "packages", packageName, "package.json")
    const source = yield* fileSystem.readFileString(manifestPath)
    const manifest = parseJson(source)
    if (manifest.name !== packageNames[packageName] || manifest.version !== version) {
      return yield* smokeError(`${manifestPath} does not match canonical name/version`)
    }
    if (
      manifest.private !== false ||
      manifest.type !== "module" ||
      manifest.sideEffects !== false ||
      !Equal.equals(manifest.files, ["dist", "README.md"])
    ) {
      return yield* smokeError(`${manifestPath} does not match the public ESM package contract`)
    }
    sourceManifests.set(manifestPath, source)
  }
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

  const tarballs: Record<string, string> = {}
  const packedManifests: Record<string, Record<string, unknown>> = {}
  for (const packageName of packages) {
    const packageDirectory = path.join(root, "packages", packageName)
    const tarball = path.join(tarballDirectory, tarballName({ packageName, version }))
    yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], packageDirectory)
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
    const manifest = parseJson(yield* run("tar", ["-xOzf", tarball, "package/package.json"], root))
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
    const sourceManifest = parseJson(sourceManifests.get(path.join(packageDirectory, "package.json"))!)
    for (const field of ["description", "type", "sideEffects", "files", "engines", "repository", "homepage", "bugs"]) {
      if (!Equal.equals(manifest[field], sourceManifest[field])) {
        return yield* smokeError(`@tenetkit/${packageName} changed its packed ${field} metadata`)
      }
    }
    if (!Equal.equals(manifest.exports, sourceManifest.exports)) {
      return yield* smokeError(`@tenetkit/${packageName} changed its public exports`)
    }
    for (const [specifier, target] of Object.entries(manifest.exports) as ReadonlyArray<
      readonly [string, { readonly types?: string; readonly import?: string }]
    >) {
      if (!Equal.equals(Object.keys(target), ["types", "import"])) {
        return yield* smokeError(`@tenetkit/${packageName}${specifier} must list types before import`)
      }
      for (const [condition, value] of Object.entries(target)) {
        const expectedExtension = condition === "types" ? ".d.ts" : ".js"
        if (!value.startsWith("./dist/") || !value.endsWith(expectedExtension)) {
          return yield* smokeError(`@tenetkit/${packageName}${specifier} has invalid ${condition} target`)
        }
        if (specifier.includes("*")) {
          const [prefix, suffix] = value.split("*") as [string, string]
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
    for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
      const expected = Object.fromEntries(
        Object.entries(sourceManifest[section] ?? {}).map(([dependency, dependencyVersion]) => {
          if (typeof dependencyVersion !== "string") return [dependency, dependencyVersion]
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
        if ((dependency === "tenetkit" || dependency.startsWith("@tenetkit/")) && dependencyVersion !== version) {
          return yield* smokeError(
            `@tenetkit/${packageName} must pin ${dependency}@${version}; packed ${dependencyVersion}`,
          )
        }
      }
    }
    if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
      return yield* smokeError(`@tenetkit/${packageName} must not bundle dependencies`)
    }
    for (const dependency of packedEffectDependencies[packageName]) {
      if (manifest.dependencies?.[dependency] !== effectVersion) {
        return yield* smokeError(
          `@tenetkit/${packageName} must pin ${dependency}@${effectVersion}; packed ${String(manifest.dependencies?.[dependency])}`,
        )
      }
    }
    if (packageName === "tenetkit") {
      for (const [dependency, dependencyVersion] of Object.entries(packedProviderDependencies)) {
        if (manifest.dependencies?.[dependency] !== dependencyVersion) {
          return yield* smokeError(
            `tenetkit must pin ${dependency}@${dependencyVersion}; packed ${String(manifest.dependencies?.[dependency])}`,
          )
        }
      }
    }
    packedManifests[manifest.name] = manifest
    tarballs[packageNames[packageName]] = `file:${tarball}`
  }

  for (const [manifestPath, source] of sourceManifests) {
    if ((yield* fileSystem.readFileString(manifestPath)) !== source) {
      return yield* smokeError(`packing mutated ${manifestPath}`)
    }
  }

  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    encodeJson({
      name: "tenetkit-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        ...tarballs,
        effect: effectVersion,
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
  yield* Effect.addFinalizer(() => registry.kill())
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
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${encodeJson(packageExports)}
for (const specifier of specifiers) await import(specifier)
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
const { AgUi } = await import("tenetkit/ag-ui")
const { Agent, Memory, ModelMiddleware, ModelRegistry, Session } = await import("tenetkit")
const { VectorStore } = await import("tenetkit/memory")
const { HarnessState, HarnessStore } = await import("tenetkit/harness")
const { McpToolSource } = await import("tenetkit/mcp")
const { Catalog, OpenAi } = await import("tenetkit/ai")
const skills = await import("tenetkit/skills")
const { TestModel } = await import("tenetkit/test")
const { Runtime, RunEvent } = await import("tenetkit/runtime")
const { Snapshot, Wire } = await import("tenetkit/transport")
const { Config, Effect, Layer, Schema } = await import("effect")
const { Tool, Toolkit } = await import("effect/unstable/ai")
if ("HostedCatalog" in skills) throw new Error("HostedCatalog must remain internal")
for (const value of [A2A.layer, AgUi.layer, Runtime.layerMemory, RunEvent.RunEvent, Snapshot.get, Wire.observerCodec]) {
  if (value === undefined) throw new Error("Runtime adapter package export is missing")
}
const tool = Tool.make("identity_proof", { parameters: Schema.Struct({ value: Schema.String }) })
const agent = Agent.make({ name: "identity-proof", toolkit: Toolkit.make(tool) })
const layers = [
  ModelRegistry.layer(),
  Session.layerMemory,
  Catalog.layer(),
  TestModel.layer([TestModel.text("identity")]),
  McpToolSource.layer({ name: "identity", transport: { kind: "http", url: "https://mcp.example/rpc" } }),
]
if (layers.some((value) => !Layer.isLayer(value))) throw new Error("TenetKit layer does not use the root Effect identity")
if (!Layer.isLayer(OpenAi.layer({ model: "gpt-4o-mini", apiKey: Config.redacted("OPENAI_API_KEY") }))) {
  throw new Error("provider constructor does not use the root Layer identity")
}
if (!Effect.isEffect(TestModel.make([TestModel.text("identity")]))) {
  throw new Error("TestModel does not use the root Effect identity")
}
console.log(\`imported \${specifiers.length} TenetKit exports\`)
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
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], consumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "bun", "runtime.mjs"], consumerDirectory)
  if ((yield* fileSystem.readFileString(path.join(consumerDirectory, "bun.lock"))).includes("npmjs.org/@tenetkit")) {
    return yield* smokeError("Bun consumer resolved a TenetKit package from npm")
  }

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

  const evidencePackages = []
  for (const packageName of packages) {
    const filename = tarballName({ packageName, version })
    const archive = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
    const manifest = parseJson(
      yield* run("tar", ["-xOzf", path.join(tarballDirectory, filename), "package/package.json"], root),
    )
    evidencePackages.push({
      name: manifest.name,
      version,
      filename,
      compressedBytes: archive.byteLength,
      unpackedBytes: Number(
        (yield* run("tar", ["-tvzf", path.join(tarballDirectory, filename)], root))
          .split("\n")
          .filter(Boolean)
          .reduce((total, entry) => total + Number(entry.trim().split(/\s+/)[2]), 0),
      ),
      sha256: new Bun.CryptoHasher("sha256").update(archive).digest("hex"),
      dependencies: manifest.dependencies ?? {},
      peerDependencies: manifest.peerDependencies ?? {},
      exports: manifest.exports,
    })
  }
  const evidence = {
    schemaVersion: 1,
    sourceCommit: (yield* run("git", ["rev-parse", "HEAD"], root)).trim(),
    tools: {
      bun: Bun.version,
      node: (yield* run("node", ["--version"], root)).trim(),
      typescript: rootManifest.workspaces.catalog.typescript,
    },
    packages: evidencePackages.toSorted((left, right) => left.name.localeCompare(right.name)),
  }
  const evidencePath = path.join(tarballDirectory, "release-evidence.json")
  yield* fileSystem.writeFileString(evidencePath, `${encodeJson(evidence)}\n`)
  const checksumFiles = [...evidencePackages.map(({ filename }) => filename), "release-evidence.json"].toSorted()
  const checksums = []
  for (const filename of checksumFiles) {
    const bytes = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
    checksums.push(`${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}  ${filename}`)
  }
  yield* fileSystem.writeFileString(path.join(tarballDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`)
  for (const item of evidencePackages) yield* Console.log(`${item.name}: ${item.compressedBytes} compressed bytes`)
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program.pipe(Effect.scoped))
