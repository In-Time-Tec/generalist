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
import { RunStore as SqliteRunStore, Runtime as SqliteRuntime } from "tenetkit/runtime/sqlite-bun"
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
type MemberEqual<Left, Right, Key extends keyof Left & keyof Right> = Equal<Left[Key], Right[Key]>
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
type RuntimeAdmitInputCanonical = Assert<
  Equal<Parameters<Runtime.Interface["admit"]>[0], Runtime.AdmitInput>
>
type RuntimeActivateInputCanonical = Assert<
  Equal<Parameters<Runtime.Interface["activate"]>[0], Runtime.ActivateInput>
>
type SqliteRuntimeOptions = import("tenetkit/runtime/sqlite-bun").Runtime.Options
type SqliteRunStoreOptions = import("tenetkit/runtime/sqlite-bun").RunStore.Options
void SqliteRuntime.layerSqlite
void SqliteRunStore.layerSqlite
type ProviderCatalogSubpath = Assert<
  MemberEqual<ProviderRoot["Catalog"], typeof import("tenetkit/ai/catalog"), "layer">
>
type ProviderOpenAiSubpath = Assert<
  MemberEqual<ProviderRoot["OpenAi"], typeof import("tenetkit/ai/openai"), "layer">
>
type ProviderOpenAiAccountAuthSubpath = Assert<
  MemberEqual<
    ProviderRoot["OpenAiAccountAuth"],
    typeof import("tenetkit/ai/openai-account-auth"),
    "layer"
  >
>
type ProviderOpenAiAccountAuthHttpSubpath = Assert<
  MemberEqual<
    ProviderRoot["OpenAiAccountAuthHttp"],
    typeof import("tenetkit/ai/openai-account-auth-http"),
    "layer"
  >
>
type ProviderAnthropicSubpath = Assert<
  MemberEqual<ProviderRoot["Anthropic"], typeof import("tenetkit/ai/anthropic"), "layer">
>
type ProviderAmazonBedrockSubpath = Assert<
  MemberEqual<ProviderRoot["AmazonBedrock"], typeof import("tenetkit/ai/amazon-bedrock"), "layer">
>
type ProviderOpenRouterSubpath = Assert<
  MemberEqual<ProviderRoot["OpenRouter"], typeof import("tenetkit/ai/openrouter"), "layer">
>
type ProviderOpenAiResponsesSubpath = Assert<
  MemberEqual<ProviderRoot["OpenAiResponses"], typeof import("tenetkit/ai/openai-responses"), "layer">
>
type ProviderOpenAiChatCompletionsSubpath = Assert<
  MemberEqual<
    ProviderRoot["OpenAiChatCompletions"],
    typeof import("tenetkit/ai/openai-chat-completions"),
    "layer"
  >
>
type ProviderDeterministicSubpath = Assert<
  MemberEqual<ProviderRoot["Deterministic"], typeof import("tenetkit/ai/deterministic"), "layer">
>
type ProviderPresetsSubpath = Assert<
  MemberEqual<ProviderRoot["Presets"], typeof import("tenetkit/ai/presets"), "layerGroq">
>
type ProviderEmbeddingSubpath = Assert<
  MemberEqual<ProviderRoot["Embedding"], typeof import("tenetkit/ai/embedding"), "layer">
>
type TransportClientSubpath = Assert<
  MemberEqual<TransportRoot["Client"], typeof import("tenetkit/transport/client"), "layerWebSocket">
>
type TransportErrorsSubpath = Assert<
  MemberEqual<TransportRoot["Errors"], typeof import("tenetkit/transport/errors"), "TransportError">
>
type TransportSseSubpath = Assert<
  MemberEqual<TransportRoot["Sse"], typeof import("tenetkit/transport/sse"), "respond">
>
type TransportWsSubpath = Assert<
  MemberEqual<TransportRoot["Ws"], typeof import("tenetkit/transport/ws"), "handle">
>
type TransportWireSubpath = Assert<
  MemberEqual<TransportRoot["Wire"], typeof import("tenetkit/transport/wire"), "producerCodec">
>
type TransportSnapshotSubpath = Assert<
  MemberEqual<TransportRoot["Snapshot"], typeof import("tenetkit/transport/snapshot"), "get">
>
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
