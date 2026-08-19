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
} from "tenetkit"
import { A2A } from "tenetkit/a2a"
import { AgUi } from "tenetkit/ag-ui"
import { VectorStore } from "tenetkit/memory"
import { OAuth, McpToolSource } from "tenetkit/mcp"
import { route as mcpRoute, type McpTools, type Options as McpRouteOptions } from "tenetkit/mcp/tools"
import { GitHubCatalog, HttpCatalog, S3Catalog } from "tenetkit/skills"
import { AmazonBedrock, Catalog, OpenAi } from "tenetkit/ai"
import { TestModel } from "tenetkit/test"
import { Cursor, Runtime, RunEvent } from "tenetkit/runtime"
import { Client, Snapshot, Sse, Wire, Ws } from "tenetkit/transport"
import { Config, Crypto, Effect, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import { Tool } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Value extends true> = Value
type LayerShape<Value extends Layer.Any> = readonly [Layer.Success<Value>, Layer.Error<Value>, Layer.Services<Value>]
type SkillsRoot = typeof import("tenetkit/skills")
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
type ModelResilienceFailureInput = Assert<Equal<ModelResilience.FailureInput, import("tenetkit").ModelResilience.FailureInput>>
type ModelResilienceFailureResolver = Assert<
  Equal<ModelResilience.FailureResolver, import("tenetkit").ModelResilience.FailureResolver>
>
type SessionCanonical = Assert<
  Equal<LayerShape<typeof Session.layerMemory>, readonly [Session.SessionStore, never, never]>
>
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
void Handoff
type ProviderRoot = typeof import("tenetkit/ai")
type TransportRoot = typeof import("tenetkit/transport")
type RuntimeRoot = typeof import("tenetkit/runtime")
type A2ARoot = typeof import("tenetkit/a2a")
type AgUiRoot = typeof import("tenetkit/ag-ui")
type A2ACanonical = Assert<Equal<A2ARoot["A2A"], typeof A2A>>
type AgUiCanonical = Assert<Equal<AgUiRoot["AgUi"], typeof AgUi>>
type RuntimeCanonical = Assert<Equal<RuntimeRoot["Runtime"], typeof Runtime>>
type RunEventCanonical = Assert<Equal<RuntimeRoot["RunEvent"], typeof RunEvent>>
type ProviderCatalogSubpath = Assert<Equal<ProviderRoot["Catalog"], typeof import("tenetkit/ai/catalog")>>
type ProviderOpenAiSubpath = Assert<Equal<ProviderRoot["OpenAi"], typeof import("tenetkit/ai/openai")>>
type ProviderOpenAiAccountAuthSubpath = Assert<
  Equal<ProviderRoot["OpenAiAccountAuth"], typeof import("tenetkit/ai/openai-account-auth")>
>
type ProviderOpenAiAccountAuthHttpSubpath = Assert<
  Equal<ProviderRoot["OpenAiAccountAuthHttp"], typeof import("tenetkit/ai/openai-account-auth-http")>
>
type ProviderAnthropicSubpath = Assert<Equal<ProviderRoot["Anthropic"], typeof import("tenetkit/ai/anthropic")>>
type ProviderAmazonBedrockSubpath = Assert<
  Equal<ProviderRoot["AmazonBedrock"], typeof import("tenetkit/ai/amazon-bedrock")>
>
type ProviderOpenRouterSubpath = Assert<Equal<ProviderRoot["OpenRouter"], typeof import("tenetkit/ai/openrouter")>>
type ProviderOpenAiResponsesSubpath = Assert<
  Equal<ProviderRoot["OpenAiResponses"], typeof import("tenetkit/ai/openai-responses")>
>
type ProviderOpenAiChatCompletionsSubpath = Assert<
  Equal<ProviderRoot["OpenAiChatCompletions"], typeof import("tenetkit/ai/openai-chat-completions")>
>
type ProviderDeterministicSubpath = Assert<
  Equal<ProviderRoot["Deterministic"], typeof import("tenetkit/ai/deterministic")>
>
type ProviderPresetsSubpath = Assert<Equal<ProviderRoot["Presets"], typeof import("tenetkit/ai/presets")>>
type ProviderEmbeddingSubpath = Assert<Equal<ProviderRoot["Embedding"], typeof import("tenetkit/ai/embedding")>>
type TransportClientSubpath = Assert<Equal<TransportRoot["Client"], typeof import("tenetkit/transport/client")>>
type TransportErrorsSubpath = Assert<Equal<TransportRoot["Errors"], typeof import("tenetkit/transport/errors")>>
type TransportSseSubpath = Assert<Equal<TransportRoot["Sse"], typeof import("tenetkit/transport/sse")>>
type TransportWsSubpath = Assert<Equal<TransportRoot["Ws"], typeof import("tenetkit/transport/ws")>>
type TransportWireSubpath = Assert<Equal<TransportRoot["Wire"], typeof import("tenetkit/transport/wire")>>
type TransportSnapshotSubpath = Assert<Equal<TransportRoot["Snapshot"], typeof import("tenetkit/transport/snapshot")>>
const cursor: Cursor.Cursor = Cursor.origin
const snapshot = Snapshot.get("run:package-smoke")
const producerCodec = Wire.producerCodec
const observerCodec = Wire.observerCodec
const webSocketClient = Client.layerWebSocket
void cursor
void snapshot
void producerCodec
void observerCodec
void webSocketClient
void Sse.streamSuccess
void Sse.respond
void Ws.handle
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
  McpTools,
  McpToolSource.McpConnectionFailed | OAuth.OAuthPending | OAuth.OAuthProviderError,
  Scope.Scope
> = mcpRoute(routeOptions)
void routed
`
