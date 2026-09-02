/** Type-level consumer source used by package smoke without inflating the runner. */
export const packageSmokeTypecheck = (
  exports: ReadonlyArray<string>,
): string => `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import { Agent, Handoff, Memory, ModelMiddleware, ModelRegistry, ModelResilience, Session, Tasks, ToolOutput } from "generalist"
import { LanguageModel } from "effect/unstable/ai"
import { A2A } from "generalist/unstable/a2a"
import { AGUI } from "generalist/unstable/ag-ui"
import { VectorStore } from "generalist/memory"
import { MCPClient, OAuth } from "generalist/unstable/mcp"
import { make as makeMcpHttpTransport } from "generalist/unstable/mcp/client/http"
import { connect as mcpConnect, type MCPTools, type Options as MCPConnectOptions } from "generalist/unstable/mcp/tools"
import { load } from "generalist/instructions"
import { GitHubCatalog, HttpCatalog, S3Catalog } from "generalist/instructions/skills"
import { layer as deterministicLayer } from "generalist/providers/deterministic"
import { make as makeModelRoute } from "generalist/unstable/providers/model-route"
import { TestModel, Testing } from "generalist/testing"
import { Cursor, Runtime, RunEvent } from "generalist/runtime"
import { RunStore as SqliteRunStore, Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
import { Server } from "generalist/server"
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
type SkillsRoot = typeof import("generalist/instructions/skills")
type InstructionsLoad = Assert<Equal<typeof load, typeof import("generalist/instructions").load>>
type InstructionFilesRemovedFromSkills = Assert<
  Equal<"InstructionFiles" extends keyof SkillsRoot ? true : false, false>
>
type HostedCatalogInternal = Assert<Equal<"HostedCatalog" extends keyof SkillsRoot ? true : false, false>>
type HttpSourceInternal = Assert<Equal<"source" extends keyof HttpCatalog.Options ? true : false, false>>
type S3SourceInternal = Assert<Equal<"source" extends keyof S3Catalog.Options ? true : false, false>>
type GitHubSourceInternal = Assert<Equal<"source" extends keyof GitHubCatalog.Options ? true : false, false>>
type StreamServices<Value> = Value extends Stream.Stream<unknown, unknown, infer Services> ? Services : never
type EffectServices<Value> = Value extends Effect.Effect<unknown, unknown, infer Services> ? Services : never
type TestingRuntimeDriver = Assert<Equal<typeof Testing.runtimeDriver, typeof import("generalist/testing/runtime-driver").runtimeDriver>>
type TasksCanonical = Assert<Equal<typeof Tasks, typeof import("generalist/tasks")>>
type MemoryCanonical = Assert<Equal<LayerShape<typeof Memory.layerNoop>, readonly [Memory.Memory, never, never]>>
type MiddlewareCanonical = Assert<
  Equal<LayerShape<typeof ModelMiddleware.layerIdentity>, readonly [ModelMiddleware.ModelMiddleware, never, never]>
>
type ModelResilienceFailureInput = Assert<Equal<ModelResilience.FailureInput, import("generalist").ModelResilience.FailureInput>>
type ModelResilienceFailureResolver = Assert<
  Equal<ModelResilience.FailureResolver, import("generalist").ModelResilience.FailureResolver>
>
type SessionCanonical = Assert<
  Equal<LayerShape<typeof Session.layerMemory>, readonly [Session.SessionDirectory, never, never]>
>
type ToolOutputCanonical = Assert<
  Equal<LayerShape<typeof ToolOutput.layerMemory>, readonly [ToolOutput.Store, never, never]>
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
const memoryRun = Agent.stream(memoryAgent, "hello")
type MemoryRunRequirements = Assert<
  Equal<StreamServices<typeof memoryRun>, LanguageModel.LanguageModel | Memory.Memory>
>
void Handoff
type ServerRoot = typeof import("generalist/server")
type RuntimeRoot = typeof import("generalist/runtime")
type A2ARoot = typeof import("generalist/unstable/a2a")
type AGUIRoot = typeof import("generalist/unstable/ag-ui")
type A2ACanonical = Assert<Equal<A2ARoot["A2A"], typeof A2A>>
type AGUICanonical = Assert<Equal<AGUIRoot["AGUI"], typeof AGUI>>
type ServerCanonical = Assert<Equal<ServerRoot["Server"], typeof Server>>
type RuntimeCanonical = Assert<Equal<RuntimeRoot["Runtime"], typeof Runtime>>
type RunEventCanonical = Assert<Equal<RuntimeRoot["RunEvent"], typeof RunEvent>>
type RuntimeAdmitInputCanonical = Assert<
  Equal<Parameters<Runtime.Service["admit"]>[0], Runtime.AdmitInput>
>
type RuntimeActivateInputCanonical = Assert<
  Equal<Parameters<Runtime.Service["activate"]>[0], Runtime.ActivateInput>
>
type SqliteRuntimeOptions = import("generalist/runtime/sqlite-bun").Runtime.Options
type SqliteRunStoreOptions = import("generalist/runtime/sqlite-bun").RunStore.Options
void SqliteRuntime.layerSqlite
void SqliteRunStore.layerSqlite
void deterministicLayer
void makeModelRoute
const cursor: Cursor.Cursor = Cursor.origin
const serverClient = Server.client({ baseUrl: "https://generalist.test" })
type ServerClientRequirements = Assert<Equal<EffectServices<typeof serverClient>, HttpClient.HttpClient>>
void cursor
void serverClient
void Server.api
void Server.layer
void Server.authBearer(Config.redacted("TOKEN"))
void Server.eventCodec
const reasoning: TestModel.ReasoningPart = TestModel.reasoning("package smoke")
void reasoning
const tokenStore: OAuth.TokenStore["Service"] = {
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
  const transport = makeMcpHttpTransport({ url: "https://mcp.example/rpc", oauth })
  return transport
}).pipe(Effect.provide(oauthLayer))
void proof
const connectOptions: MCPConnectOptions = {
  name: "package-smoke",
  transport: makeMcpHttpTransport({ url: "https://mcp.example/rpc" }),
}
const routed: Effect.Effect<MCPTools, MCPClient.MCPConnectionFailed | OAuth.OAuthProviderError, Scope.Scope> =
  mcpConnect(connectOptions)
void routed
`
