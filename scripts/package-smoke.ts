import { runMain } from "@effect/platform-bun/BunRuntime"
import { layer } from "@effect/platform-bun/BunServices"
import { Effect, FileSystem, Path, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const packages = ["core", "test", "skills", "memory", "providers", "mcp", "transport", "foldkit"] as const

const exports = [
  "@batonfx/core",
  "@batonfx/test",
  "@batonfx/skills",
  "@batonfx/memory",
  "@batonfx/providers",
  "@batonfx/providers/catalog",
  "@batonfx/providers/openai",
  "@batonfx/providers/anthropic",
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

const run = Effect.fn("PackageSmoke.run")(function* (command: string, args: ReadonlyArray<string>, cwd: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(ChildProcess.make(command, args, { cwd }))
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
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "baton-package-smoke-" })
  const tarballDirectory = process.env.PACKAGE_ARTIFACT_DIR
    ? path.resolve(process.env.PACKAGE_ARTIFACT_DIR)
    : path.join(directory, "packages")
  const consumerDirectory = path.join(directory, "consumer")
  yield* fileSystem.makeDirectory(tarballDirectory, { recursive: true })
  yield* fileSystem.makeDirectory(consumerDirectory, { recursive: true })

  yield* run("bun", ["run", "build"], root)

  const tarballs: Record<string, string> = {}
  for (const packageName of packages) {
    const packageDirectory = path.join(root, "packages", packageName)
    const tarball = path.join(tarballDirectory, `${packageName}.tgz`)
    yield* run("bun", ["pm", "pack", "--filename", tarball, "--quiet"], packageDirectory)
    const archive = yield* fileSystem.readFile(tarball)
    if (archive.byteLength > 1_500_000) {
      return yield* Effect.fail(new Error(`@batonfx/${packageName} tarball exceeds 1.5 MB: ${archive.byteLength}`))
    }
    const listing = yield* run("tar", ["-tzf", tarball], root)
    const unexpected = listing
      .split("\n")
      .filter((entry) => entry.length > 0)
      .filter(
        (entry) =>
          entry !== "package/package.json" && entry !== "package/README.md" && !entry.startsWith("package/dist/"),
      )
    if (unexpected.length > 0) {
      return yield* Effect.fail(
        new Error(`@batonfx/${packageName} contains unexpected files: ${unexpected.join(", ")}`),
      )
    }
    tarballs[`@batonfx/${packageName}`] = `file:${tarball}`
  }

  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "package.json"),
    JSON.stringify({
      name: "baton-package-consumer",
      private: true,
      type: "module",
      dependencies: {
        ...tarballs,
        effect: "4.0.0-beta.93",
        foldkit: "0.122.0",
        typescript: "5.8.2",
      },
      overrides: tarballs,
    }),
  )
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
import { TestModel } from "@batonfx/test"
import { SessionRegistry } from "@batonfx/transport"
import { Crypto, Effect, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
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
type MemoryCompatibility = Assert<Equal<typeof Memory.layerNoop, typeof Memory.noopLayer>>
type MiddlewareCanonical = Assert<
  Equal<LayerShape<typeof ModelMiddleware.layerIdentity>, readonly [ModelMiddleware.ModelMiddleware, never, never]>
>
type MiddlewareCompatibility = Assert<Equal<typeof ModelMiddleware.layerIdentity, typeof ModelMiddleware.identityLayer>>
type SessionCanonical = Assert<
  Equal<LayerShape<typeof Session.layerMemory>, readonly [Session.SessionStore, never, never]>
>
type SessionCompatibility = Assert<Equal<typeof Session.layerMemory, typeof Session.memoryLayer>>
type RegistryCanonical = Assert<Equal<typeof ModelRegistry.layerMemory, typeof ModelRegistry.layer>>
type RegistryCompatibility = Assert<Equal<typeof ModelRegistry.layerMemory, typeof ModelRegistry.memoryLayer>>
type ToolOutputCanonical = Assert<
  Equal<LayerShape<typeof ToolOutput.layerMemory>, readonly [ToolOutput.ToolOutputStore, never, never]>
>
type VectorStoreCanonical = Assert<
  Equal<LayerShape<typeof VectorStore.layerMemory>, readonly [VectorStore.VectorStore, never, never]>
>
type VectorStoreCompatibility = Assert<Equal<typeof VectorStore.layerMemory, typeof VectorStore.memoryLayer>>
const memoryAgent = Agent.make({
  name: "memory-package-smoke",
  memory: { agent: "memory-package-smoke", subject: "subject" },
})
type MemoryAgentRequirements = Assert<
  Equal<Agent.Requirements<typeof memoryAgent>, LanguageModel.LanguageModel | Memory.Memory>
>
const persistedRun = Agent.persisted(memoryAgent, {
  prompt: "hello",
  persistence: { chatId: "package-smoke" },
})
type PersistedRunRequirements = Assert<
  Equal<
    StreamServices<typeof persistedRun>,
    LanguageModel.LanguageModel | Memory.Memory | Chat.Persistence
  >
>
const sessionRegistryLayer = SessionRegistry.layerMemory({ agent: Agent.make("package-smoke") })
const sessionRegistryOptions: SessionRegistry.MemoryOptions<{}, LanguageModel.LanguageModel> = {
  agent: Agent.make("annotated-package-smoke"),
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
  { agent: Agent.make("plain-package-smoke"), prompt: "plain" },
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
type ProviderAnthropicSubpath = Assert<Equal<ProviderRoot["Anthropic"], typeof import("@batonfx/providers/anthropic")>>
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
const reasoning: TestModel.ReasoningPart = TestModel.reasoning("package smoke")
void reasoning
const tokenStore: OAuth.TokenStoreInterface = {
  load: () => Effect.succeed(Option.none()),
  save: (_server, tokens) => Effect.sync(() => void Redacted.value(tokens)),
  remove: () => Effect.void,
}
const storeLayer: Layer.Layer<OAuth.TokenStore> = OAuth.tokenStoreTestLayer(tokenStore)
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
  McpToolSource.McpConnectionError | OAuth.OAuthPendingError | OAuth.OAuthProviderError,
  Scope.Scope
> = mcpRoute(routeOptions)
void routed
`,
  )
  yield* fileSystem.writeFileString(
    path.join(consumerDirectory, "runtime.mjs"),
    `const specifiers = ${JSON.stringify(exports)}
for (const specifier of specifiers) await import(specifier)
const { Memory, ModelMiddleware, ModelRegistry, Session } = await import("@batonfx/core")
const { VectorStore } = await import("@batonfx/memory")
const skills = await import("@batonfx/skills")
if ("HostedCatalog" in skills) throw new Error("HostedCatalog must remain internal")
const aliases = [
  [Memory.layerNoop, Memory.noopLayer, "Memory.noopLayer"],
  [ModelMiddleware.layerIdentity, ModelMiddleware.identityLayer, "ModelMiddleware.identityLayer"],
  [Session.layerMemory, Session.memoryLayer, "Session.memoryLayer"],
  [ModelRegistry.layerMemory, ModelRegistry.layer, "ModelRegistry.layer"],
  [ModelRegistry.layerMemory, ModelRegistry.memoryLayer, "ModelRegistry.memoryLayer"],
  [VectorStore.layerMemory, VectorStore.memoryLayer, "VectorStore.memoryLayer"],
]
for (const [canonical, compatibility, name] of aliases) {
  if (canonical !== compatibility) throw new Error(name + " must preserve runtime identity")
}
console.log(\`imported \${specifiers.length} Baton exports\`)
`,
  )

  yield* run("bun", ["install"], consumerDirectory)
  yield* run("bun", ["tsc", "--noEmit"], consumerDirectory)
  yield* run("node", ["runtime.mjs"], consumerDirectory)
  yield* run("bun", ["runtime.mjs"], consumerDirectory)
}).pipe(Effect.scoped, Effect.provide(layer))

runMain(program)
