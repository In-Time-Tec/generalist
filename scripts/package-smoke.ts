import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { Config, Effect, FileSystem, Option, Path, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const packages = ["core", "test", "skills", "memory", "providers", "mcp", "transport", "foldkit"] as const
const effectVersion = "4.0.0-beta.98"
const compressedSizeLimits: Record<(typeof packages)[number], number> = {
  core: 85_000,
  test: 8_000,
  skills: 13_000,
  memory: 10_000,
  providers: 35_000,
  mcp: 12_000,
  transport: 30_000,
  foldkit: 16_000,
}

const packedEffectDependencies: Record<(typeof packages)[number], ReadonlyArray<string>> = {
  core: [],
  test: [],
  skills: [],
  memory: [],
  providers: ["@effect/ai-anthropic", "@effect/ai-openai", "@effect/ai-openai-compat", "@effect/ai-openrouter"],
  mcp: [],
  transport: [],
  foldkit: [],
}
const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

const sortRecord = (value: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(value ?? {}).toSorted(([left], [right]) => left.localeCompare(right)))

const exports = [
  "@batonfx/core",
  "@batonfx/test",
  "@batonfx/skills",
  "@batonfx/memory",
  "@batonfx/providers",
  "@batonfx/providers/catalog",
  "@batonfx/providers/openai",
  "@batonfx/providers/openai-account-auth",
  "@batonfx/providers/openai-account-auth-http",
  "@batonfx/providers/anthropic",
  "@batonfx/providers/amazon-bedrock",
  "@batonfx/providers/openrouter",
  "@batonfx/providers/openai-compat",
  "@batonfx/providers/deterministic",
  "@batonfx/providers/presets",
  "@batonfx/providers/embedding",
  "@batonfx/mcp",
  "@batonfx/mcp/baton",
  "@batonfx/transport",
  "@batonfx/transport/client",
  "@batonfx/transport/errors",
  "@batonfx/transport/sse",
  "@batonfx/transport/ws",
  "@batonfx/transport/wire",
  "@batonfx/transport/session-registry",
  "@batonfx/foldkit",
] as const

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
    return yield* Effect.fail(new Error(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`))
  }
  return stdout
})

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const rootManifest = JSON.parse(yield* fileSystem.readFileString(path.join(root, "package.json")))
  const version = rootManifest.version as string
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return yield* Effect.fail(new Error(`root version must be canonical semver: ${version}`))
  }
  const discovered = (yield* fileSystem.readDirectory(path.join(root, "packages"))).toSorted()
  if (JSON.stringify(discovered) !== JSON.stringify(packages.toSorted())) {
    return yield* Effect.fail(new Error(`public package set mismatch: ${discovered.join(", ")}`))
  }
  const sourceManifests = new Map<string, string>()
  for (const packageName of packages) {
    const manifestPath = path.join(root, "packages", packageName, "package.json")
    const source = yield* fileSystem.readFileString(manifestPath)
    const manifest = JSON.parse(source)
    if (manifest.name !== `@batonfx/${packageName}` || manifest.version !== version) {
      return yield* Effect.fail(new Error(`${manifestPath} does not match canonical name/version`))
    }
    if (
      manifest.private !== false ||
      manifest.type !== "module" ||
      manifest.sideEffects !== false ||
      JSON.stringify(manifest.files) !== JSON.stringify(["dist", "README.md"])
    ) {
      return yield* Effect.fail(new Error(`${manifestPath} does not match the public ESM package contract`))
    }
    sourceManifests.set(manifestPath, source)
  }
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "baton-package-smoke-" })
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
    const tarball = path.join(tarballDirectory, `batonfx-${packageName}-${version}.tgz`)
    yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], packageDirectory)
    const archive = yield* fileSystem.readFile(tarball)
    if (archive.byteLength > compressedSizeLimits[packageName]) {
      return yield* Effect.fail(
        new Error(
          `@batonfx/${packageName} tarball exceeds ${compressedSizeLimits[packageName]} bytes: ${archive.byteLength}`,
        ),
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
      return yield* Effect.fail(
        new Error(`@batonfx/${packageName} contains unexpected files: ${unexpected.join(", ")}`),
      )
    }
    if (entries.some((entry) => entry.startsWith("/") || entry.split("/").includes(".."))) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} contains an unsafe path`))
    }
    const verboseListing = yield* run("tar", ["-tvzf", tarball], root)
    const unsafeTypes = verboseListing
      .split("\n")
      .filter((entry) => entry.length > 0 && entry[0] !== "-" && entry[0] !== "d")
    if (unsafeTypes.length > 0) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} contains a non-regular entry`))
    }
    const manifest = JSON.parse(yield* run("tar", ["-xOzf", tarball, "package/package.json"], root))
    if (manifest.name !== `@batonfx/${packageName}` || manifest.version !== version) {
      return yield* Effect.fail(new Error(`packed identity mismatch for ${packageName}`))
    }
    if (manifest.peerDependencies?.effect !== effectVersion || manifest.dependencies?.effect !== undefined) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} must expose Effect only as exact peer`))
    }
    if (/workspace:|catalog:/.test(JSON.stringify(manifest))) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} contains an unresolved protocol`))
    }
    for (const lifecycle of ["preinstall", "install", "postinstall", "prepare"]) {
      if (manifest.scripts?.[lifecycle] !== undefined) {
        return yield* Effect.fail(new Error(`@batonfx/${packageName} contains the ${lifecycle} lifecycle hook`))
      }
    }
    const sourceManifest = JSON.parse(sourceManifests.get(path.join(packageDirectory, "package.json"))!)
    for (const field of ["description", "type", "sideEffects", "files", "engines", "repository", "homepage", "bugs"]) {
      if (JSON.stringify(manifest[field]) !== JSON.stringify(sourceManifest[field])) {
        return yield* Effect.fail(new Error(`@batonfx/${packageName} changed its packed ${field} metadata`))
      }
    }
    if (JSON.stringify(manifest.exports) !== JSON.stringify(sourceManifest.exports)) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} changed its public exports`))
    }
    for (const [specifier, target] of Object.entries(manifest.exports) as ReadonlyArray<
      readonly [string, { readonly types?: string; readonly import?: string }]
    >) {
      if (JSON.stringify(Object.keys(target)) !== JSON.stringify(["types", "import"])) {
        return yield* Effect.fail(new Error(`@batonfx/${packageName}${specifier} must list types before import`))
      }
      for (const [condition, value] of Object.entries(target)) {
        const expectedExtension = condition === "types" ? ".d.ts" : ".js"
        if (!value.startsWith("./dist/") || !value.endsWith(expectedExtension)) {
          return yield* Effect.fail(new Error(`@batonfx/${packageName}${specifier} has invalid ${condition} target`))
        }
        if (!entries.includes(`package/${value.slice(2)}`)) {
          return yield* Effect.fail(new Error(`@batonfx/${packageName}${specifier} is missing ${value}`))
        }
      }
    }
    for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
      const expected = Object.fromEntries(
        Object.entries(sourceManifest[section] ?? {}).map(([dependency, dependencyVersion]) => {
          if (typeof dependencyVersion !== "string") return [dependency, dependencyVersion]
          if (dependencyVersion.startsWith("workspace:")) return [dependency, version]
          if (dependencyVersion.startsWith("catalog:")) {
            const catalogVersion = rootManifest.workspaces.catalog[dependency]
            if (typeof catalogVersion !== "string") {
              throw new Error(`${sourceManifest.name} references missing catalog dependency ${dependency}`)
            }
            return [dependency, catalogVersion]
          }
          return [dependency, dependencyVersion]
        }),
      )
      if (JSON.stringify(sortRecord(manifest[section])) !== JSON.stringify(sortRecord(expected))) {
        return yield* Effect.fail(new Error(`@batonfx/${packageName} changed its packed ${section}`))
      }
      for (const [dependency, dependencyVersion] of Object.entries(manifest[section] ?? {})) {
        if (dependency.startsWith("@batonfx/") && dependencyVersion !== version) {
          return yield* Effect.fail(
            new Error(`@batonfx/${packageName} must pin ${dependency}@${version}; packed ${dependencyVersion}`),
          )
        }
      }
    }
    if (manifest.bundledDependencies !== undefined || manifest.bundleDependencies !== undefined) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} must not bundle dependencies`))
    }
    for (const dependency of packedEffectDependencies[packageName]) {
      if (manifest.dependencies?.[dependency] !== effectVersion) {
        return yield* Effect.fail(
          new Error(
            `@batonfx/${packageName} must pin ${dependency}@${effectVersion}; packed ${String(manifest.dependencies?.[dependency])}`,
          ),
        )
      }
    }
    if (packageName === "providers") {
      for (const [dependency, dependencyVersion] of Object.entries(packedProviderDependencies)) {
        if (manifest.dependencies?.[dependency] !== dependencyVersion) {
          return yield* Effect.fail(
            new Error(
              `@batonfx/providers must pin ${dependency}@${dependencyVersion}; packed ${String(manifest.dependencies?.[dependency])}`,
            ),
          )
        }
      }
    }
    if (JSON.stringify(manifest).includes("4.0.0-beta.93")) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} packed manifest contains Effect beta.93`))
    }
    packedManifests[manifest.name] = manifest
    tarballs[`@batonfx/${packageName}`] = `file:${tarball}`
  }

  for (const [manifestPath, source] of sourceManifests) {
    if ((yield* fileSystem.readFileString(manifestPath)) !== source) {
      return yield* Effect.fail(new Error(`packing mutated ${manifestPath}`))
    }
  }

  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    JSON.stringify({
      name: "baton-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        ...tarballs,
        effect: effectVersion,
        foldkit: "0.122.0",
        typescript: rootManifest.workspaces.catalog.typescript,
      },
    }),
  )
  const registryDirectory = path.join(directory, "registry")
  yield* fileSystem.makeDirectory(registryDirectory)
  yield* fileSystem.writeFileString(
    path.join(registryDirectory, "data.json"),
    JSON.stringify({ version, tarballDirectory, manifests: packedManifests }),
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
  const filename = \`batonfx-\${name.slice("@batonfx/".length)}-\${version}.tgz\`
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
    Effect.flatMap(
      Option.match({ onNone: () => Effect.fail(new Error("local registry did not start")), onSome: Effect.succeed }),
    ),
  )
  yield* fileSystem.writeFileString(path.join(consumerDirectory, ".npmrc"), `@batonfx:registry=${registryOrigin}\n`)
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "tsconfig.json"),
    JSON.stringify({
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
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "typecheck.ts"),
    `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import { Agent, Chat, Handoff, LanguageModel, Memory, ModelMiddleware, ModelRegistry, Session, ToolOutput } from "@batonfx/core"
import { VectorStore } from "@batonfx/memory"
import { OAuth, McpToolSource } from "@batonfx/mcp"
import { route as mcpRoute, type BatonTools, type Options as McpRouteOptions } from "@batonfx/mcp/baton"
import { GitHubCatalog, HttpCatalog, S3Catalog } from "@batonfx/skills"
import { AmazonBedrock, Catalog, OpenAi } from "@batonfx/providers"
import { TestModel } from "@batonfx/test"
import { SessionRegistry, Sse, Wire, Ws } from "@batonfx/transport"
import { Config, Crypto, Effect, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Value extends true> = Value
type LayerShape<Value extends Layer.Any> = readonly [Layer.Success<Value>, Layer.Error<Value>, Layer.Services<Value>]
type SkillsRoot = typeof import("@batonfx/skills")
type HostedCatalogInternal = Assert<Equal<"HostedCatalog" extends keyof SkillsRoot ? true : false, false>>
type HttpSourceInternal = Assert<Equal<"source" extends keyof HttpCatalog.Options ? true : false, false>>
type S3SourceInternal = Assert<Equal<"source" extends keyof S3Catalog.Options ? true : false, false>>
type GitHubSourceInternal = Assert<Equal<"source" extends keyof GitHubCatalog.Options ? true : false, false>>
type StreamServices<Value> = Value extends Stream.Stream<unknown, unknown, infer Services> ? Services : never
type EffectServices<Value> = Value extends Effect.Effect<unknown, unknown, infer Services> ? Services : never
type MemoryCanonical = Assert<Equal<LayerShape<typeof Memory.layerNoop>, readonly [Memory.Memory, never, never]>>
type MiddlewareCanonical = Assert<
  Equal<LayerShape<typeof ModelMiddleware.layerIdentity>, readonly [ModelMiddleware.ModelMiddleware, never, never]>
>
type SessionCanonical = Assert<
  Equal<LayerShape<typeof Session.layerMemory>, readonly [Session.SessionStore, never, never]>
>
type RegistryCanonical = Assert<Equal<typeof ModelRegistry.layerMemory, typeof ModelRegistry.layer>>
type ToolOutputCanonical = Assert<
  Equal<LayerShape<typeof ToolOutput.layerMemory>, readonly [ToolOutput.ToolOutputStore, never, never]>
>
type VectorStoreCanonical = Assert<
  Equal<LayerShape<typeof VectorStore.layerMemory>, readonly [VectorStore.VectorStore, never, never]>
>
const memoryAgent = Agent.make({
  name: "memory-package-smoke",
  memory: { agent: "memory-package-smoke", subject: "subject" },
})
type MemoryAgentRequirements = Assert<
  Equal<Agent.Requirements<typeof memoryAgent>, LanguageModel.LanguageModel | Memory.Memory>
>
const persistedRun = Agent.stream(memoryAgent, {
  prompt: "hello",
  persistence: { chatId: "package-smoke" },
})
type PersistedRunRequirements = Assert<
  Equal<
    StreamServices<typeof persistedRun>,
    LanguageModel.LanguageModel | Memory.Memory | Chat.Persistence | Agent.Runtime
  >
>
const sessionRegistryLayer = SessionRegistry.layerMemory({ agent: Agent.make({ name: "package-smoke" }) })
const sessionRegistryOptions: SessionRegistry.MemoryOptions<{}, LanguageModel.LanguageModel> = {
  agent: Agent.make({ name: "annotated-package-smoke" }),
}
const annotatedSessionRegistryLayer = SessionRegistry.layerMemory(sessionRegistryOptions)
type SessionRegistryCanonical = Assert<
  Equal<
    LayerShape<typeof sessionRegistryLayer>,
    readonly [SessionRegistry.SessionRegistry, never, LanguageModel.LanguageModel | Chat.Persistence]
  >
>
type AnnotatedSessionRegistryCanonical = Assert<
  Equal<
    LayerShape<typeof annotatedSessionRegistryLayer>,
    readonly [SessionRegistry.SessionRegistry, never, LanguageModel.LanguageModel | Chat.Persistence]
  >
>
const fanOut = Handoff.fanOut([
  { agent: Agent.make({ name: "plain-package-smoke" }), prompt: "plain" },
  { agent: memoryAgent, prompt: "memory" },
])
type FanOutRequirements = Assert<
  Equal<EffectServices<typeof fanOut>, LanguageModel.LanguageModel | Memory.Memory>
>
const packageSmokeTool = Tool.make("package_smoke_tool", {
  parameters: Schema.Struct({ value: Schema.String }),
  success: Schema.String,
})
const packageSmokeToolAgent = Agent.make({ name: "tool-package-smoke", toolkit: Toolkit.make(packageSmokeTool) })
const providerLayer = OpenAi.layer({ model: "gpt-4o-mini", apiKey: Config.redacted("OPENAI_API_KEY") })
const bedrockProviderLayer = AmazonBedrock.layer({ model: "us.example.model" })
const providerCatalogLayer: Layer.Layer<Catalog.ModelCatalog> = Catalog.layer()
const testModelLayer: Layer.Layer<LanguageModel.LanguageModel> = TestModel.layer([TestModel.text("identity")])
type ProviderLayerRequirements = Assert<Equal<Layer.Services<typeof providerLayer>, HttpClient.HttpClient>>
type ProviderLayerFailure = Assert<Equal<Layer.Error<typeof providerLayer>, Config.ConfigError>>
type ProviderLayerSuccess = Assert<Equal<Layer.Success<typeof providerLayer>, ModelRegistry.ModelRegistry>>
type BedrockProviderLayerRequirements = Assert<Equal<Layer.Services<typeof bedrockProviderLayer>, never>>
type BedrockProviderLayerFailure = Assert<Equal<Layer.Error<typeof bedrockProviderLayer>, never>>
type BedrockProviderLayerSuccess = Assert<Equal<Layer.Success<typeof bedrockProviderLayer>, ModelRegistry.ModelRegistry>>
void providerLayer
void bedrockProviderLayer
void providerCatalogLayer
void testModelLayer
const toolFanOut = Handoff.fanOut([{ agent: packageSmokeToolAgent, prompt: "tool" }])
const heterogeneousSupervisor = Handoff.supervisor({
  name: "heterogeneous-package-smoke",
  specialists: [memoryAgent, packageSmokeToolAgent],
})
void toolFanOut
void heterogeneousSupervisor
type ProviderRoot = typeof import("@batonfx/providers")
type TransportRoot = typeof import("@batonfx/transport")
type ProviderCatalogSubpath = Assert<Equal<ProviderRoot["Catalog"], typeof import("@batonfx/providers/catalog")>>
type ProviderOpenAiSubpath = Assert<Equal<ProviderRoot["OpenAi"], typeof import("@batonfx/providers/openai")>>
type ProviderOpenAiAccountAuthSubpath = Assert<
  Equal<ProviderRoot["OpenAiAccountAuth"], typeof import("@batonfx/providers/openai-account-auth")>
>
type ProviderOpenAiAccountAuthHttpSubpath = Assert<
  Equal<ProviderRoot["OpenAiAccountAuthHttp"], typeof import("@batonfx/providers/openai-account-auth-http")>
>
type ProviderAnthropicSubpath = Assert<Equal<ProviderRoot["Anthropic"], typeof import("@batonfx/providers/anthropic")>>
type ProviderAmazonBedrockSubpath = Assert<
  Equal<ProviderRoot["AmazonBedrock"], typeof import("@batonfx/providers/amazon-bedrock")>
>
type ProviderOpenRouterSubpath = Assert<Equal<ProviderRoot["OpenRouter"], typeof import("@batonfx/providers/openrouter")>>
type ProviderOpenAiCompatibleSubpath = Assert<
  Equal<ProviderRoot["OpenAiCompatible"], typeof import("@batonfx/providers/openai-compat")>
>
type ProviderDeterministicSubpath = Assert<
  Equal<ProviderRoot["Deterministic"], typeof import("@batonfx/providers/deterministic")>
>
type ProviderPresetsSubpath = Assert<Equal<ProviderRoot["Presets"], typeof import("@batonfx/providers/presets")>>
type ProviderEmbeddingSubpath = Assert<Equal<ProviderRoot["Embedding"], typeof import("@batonfx/providers/embedding")>>
type TransportClientSubpath = Assert<Equal<TransportRoot["Client"], typeof import("@batonfx/transport/client")>>
type TransportErrorsSubpath = Assert<Equal<TransportRoot["Errors"], typeof import("@batonfx/transport/errors")>>
type TransportSseSubpath = Assert<Equal<TransportRoot["Sse"], typeof import("@batonfx/transport/sse")>>
type TransportWsSubpath = Assert<Equal<TransportRoot["Ws"], typeof import("@batonfx/transport/ws")>>
type TransportWireSubpath = Assert<Equal<TransportRoot["Wire"], typeof import("@batonfx/transport/wire")>>
type TransportSessionRegistrySubpath = Assert<
  Equal<TransportRoot["SessionRegistry"], typeof import("@batonfx/transport/session-registry")>
>
type LooseEventDerived = Assert<Equal<Wire.LooseEventType, typeof Wire.LooseEventSchema.Type>>
type LooseServerFrameDerived = Assert<Equal<Wire.LooseServerFrameType, typeof Wire.LooseServerFrame.Type>>
type LooseServerFrameIsDistinct = Assert<Equal<Equal<Wire.LooseServerFrameType, Wire.ServerFrameType>, false>>
const fixedTransportToolkit = Toolkit.empty
const explicitFixedCapability = { capability: "fixed", toolkit: fixedTransportToolkit } as const
const runtimeDynamicCapability = { capability: "runtime-dynamic" } as const
const fixedCodec = Wire.codec(fixedTransportToolkit)
const explicitFixedCodec = Wire.codec(explicitFixedCapability)
const fixedSseSchema = Sse.streamSuccess(fixedTransportToolkit)
const explicitFixedSseSchema = Sse.streamSuccess(explicitFixedCapability)
const fixedSseRespond = Sse.respond(fixedTransportToolkit)
const explicitFixedSseRespond = Sse.respond(explicitFixedCapability)
const fixedWsHandle = Ws.handle(fixedTransportToolkit)
const explicitFixedWsHandle = Ws.handle(explicitFixedCapability)
const runtimeDynamicCodec = Wire.codec(runtimeDynamicCapability)
const runtimeDynamicSseSchema = Sse.streamSuccess(runtimeDynamicCapability)
const runtimeDynamicSseRespond = Sse.respond(runtimeDynamicCapability)
const runtimeDynamicWsHandle = Ws.handle(runtimeDynamicCapability)
void fixedCodec
void explicitFixedCodec
void fixedSseSchema
void explicitFixedSseSchema
void fixedSseRespond
void explicitFixedSseRespond
void fixedWsHandle
void explicitFixedWsHandle
void runtimeDynamicCodec
void runtimeDynamicSseSchema
void runtimeDynamicSseRespond
void runtimeDynamicWsHandle
const reasoning: TestModel.ReasoningPart = TestModel.reasoning("package smoke")
void reasoning
const tokenStore: OAuth.TokenStoreInterface = {
  load: () => Effect.succeed(Option.none()),
  save: (_server, tokens) => Effect.sync(() => void Redacted.value(tokens)),
  remove: () => Effect.void,
}
const storeLayer: Layer.Layer<OAuth.TokenStore> = OAuth.layerTokenStoreTest(tokenStore)
const cryptoLayer = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => new Uint8Array(size),
    digest: (_algorithm, data) => Effect.succeed(data),
  }),
)
const oauthLayer = OAuth.layer({
  serverUrl: "https://mcp.example/rpc",
  redirectUrl: "http://127.0.0.1/callback",
  clientMetadata: { redirect_uris: ["http://127.0.0.1/callback"] },
}).pipe(Layer.provide(Layer.merge(storeLayer, cryptoLayer)))
const proof = Effect.gen(function* () {
  const oauth = yield* OAuth.OAuth
  yield* oauth.pending
  const transport: McpToolSource.McpTransport = { kind: "http", url: "https://mcp.example/rpc", oauth }
  return transport
}).pipe(Effect.provide(oauthLayer))
void proof
const routeOptions: McpRouteOptions = {
  name: "package-smoke",
  transport: { kind: "http", url: "https://mcp.example/rpc" },
}
const routed: Effect.Effect<
  BatonTools,
  McpToolSource.McpConnectionFailed | OAuth.OAuthPending | OAuth.OAuthProviderError,
  Scope.Scope
> = mcpRoute(routeOptions)
void routed
`,
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${JSON.stringify(exports)}
for (const specifier of specifiers) await import(specifier)
const { Agent, Memory, ModelMiddleware, ModelRegistry, Session } = await import("@batonfx/core")
const { VectorStore } = await import("@batonfx/memory")
const { McpToolSource } = await import("@batonfx/mcp")
const { Catalog, OpenAi } = await import("@batonfx/providers")
const skills = await import("@batonfx/skills")
const { TestModel } = await import("@batonfx/test")
const { Config, Effect, Layer, Schema } = await import("effect")
const { Tool, Toolkit } = await import("effect/unstable/ai")
if ("HostedCatalog" in skills) throw new Error("HostedCatalog must remain internal")
const tool = Tool.make("identity_proof", { parameters: Schema.Struct({ value: Schema.String }) })
const agent = Agent.make({ name: "identity-proof", toolkit: Toolkit.make(tool) })
const layers = [
  ModelRegistry.layerMemory(),
  Session.layerMemory,
  Catalog.layer(),
  TestModel.layer([TestModel.text("identity")]),
  McpToolSource.layer({ name: "identity", transport: { kind: "http", url: "https://mcp.example/rpc" } }),
]
if (layers.some((value) => !Layer.isLayer(value))) throw new Error("Baton layer does not use the root Effect identity")
if (!Layer.isLayer(OpenAi.layer({ model: "gpt-4o-mini", apiKey: Config.redacted("OPENAI_API_KEY") }))) {
  throw new Error("provider constructor does not use the root Layer identity")
}
if (!Effect.isEffect(TestModel.make([TestModel.text("identity")]))) {
  throw new Error("TestModel does not use the root Effect identity")
}
console.log(\`imported \${specifiers.length} Baton exports\`)
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
    return yield* Effect.fail(
      new Error(`consumer installed ${installedEffects.length} Effect copies:\n${installedEffects.join("\n")}`),
    )
  }
  yield* run("bun", ["tsc", "--noEmit"], consumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], consumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "bun", "runtime.mjs"], consumerDirectory)
  if ((yield* fileSystem.readFileString(path.join(consumerDirectory, "bun.lock"))).includes("npmjs.org/@batonfx")) {
    return yield* Effect.fail(new Error("Bun consumer resolved a Baton package from npm"))
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
    return yield* Effect.fail(new Error(`npm consumer installed ${npmEffects.length} Effect copies`))
  }
  yield* run("npx", ["tsc", "--noEmit"], npmConsumerDirectory)
  yield* run("env", ["-u", "NODE_PATH", "-u", "NODE_OPTIONS", "node", "runtime.mjs"], npmConsumerDirectory)
  if (
    (yield* fileSystem.readFileString(path.join(npmConsumerDirectory, "package-lock.json"))).includes(
      "npmjs.org/@batonfx",
    )
  ) {
    return yield* Effect.fail(new Error("npm consumer resolved a Baton package from npm"))
  }

  const evidencePackages = []
  for (const packageName of packages) {
    const filename = `batonfx-${packageName}-${version}.tgz`
    const archive = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
    const manifest = JSON.parse(
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
  yield* fileSystem.writeFileString(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`)
  const checksumFiles = [...evidencePackages.map(({ filename }) => filename), "release-evidence.json"].toSorted()
  const checksums = []
  for (const filename of checksumFiles) {
    const bytes = yield* fileSystem.readFile(path.join(tarballDirectory, filename))
    checksums.push(`${new Bun.CryptoHasher("sha256").update(bytes).digest("hex")}  ${filename}`)
  }
  yield* fileSystem.writeFileString(path.join(tarballDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`)
  for (const item of evidencePackages) console.log(`${item.name}: ${item.compressedBytes} compressed bytes`)
}).pipe(Effect.scoped, Effect.provide(layer))

runMain(program)
