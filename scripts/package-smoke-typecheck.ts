/** Type-level consumer source used by package smoke without inflating the runner. */
export const packageSmokeTypecheck = (
  exports: ReadonlyArray<string>,
): string => `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import {
  Agent,
  Chat,
  Handoff,
  LanguageModel,
  Memory,
  ModelMiddleware,
  ModelRegistry,
  ModelResilience,
  Session,
  ToolOutput,
} from "@batonfx/core"
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
type ModelResilienceFailureInput = Assert<Equal<ModelResilience.FailureInput, import("@batonfx/core").ModelResilience.FailureInput>>
type ModelResilienceFailureResolver = Assert<
  Equal<ModelResilience.FailureResolver, import("@batonfx/core").ModelResilience.FailureResolver>
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
void Handoff
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
`
