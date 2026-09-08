/** Type-level consumer source used by package smoke without inflating the runner. */
export const packageSmokeTypecheck = (
  exports: ReadonlyArray<string>,
): string => `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import { Agent, DurableDriver, Handoff, Memory, ModelMiddleware, ModelRegistry, ModelResilience, Session, Tasks, ToolOutput } from "generalist"
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
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import * as R2 from "generalist/durability/r2"
import * as TestDurability from "generalist/testing/durability"
import * as Components from "generalist/components"
import { Server } from "generalist/server"
import { Generalist, ToolIdentity, type HostToolRun } from "generalist/host"
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
const independentTool = Tool.make("package-checks", {
  parameters: Schema.Struct({ count: Schema.FiniteFromString }),
  success: Schema.FiniteFromString,
  failure: Schema.Struct({ reason: Schema.String }),
}).annotate(ToolIdentity, { implementation: "checks-v1", policy: "checks-policy-v1" })
const toolHost = Generalist.create({ agents: [], tools: [independentTool] })
type ToolHostNeedsNoModel = Assert<Equal<Extract<EffectServices<typeof toolHost>, LanguageModel.LanguageModel>, never>>
const toolAdmission = Effect.gen(function* () {
  const host = yield* toolHost
  return yield* host.tools.start(independentTool, { count: 1 }, { commandId: "package-checks" })
})
type TypedToolHandle = Assert<Equal<Effect.Success<typeof toolAdmission>, HostToolRun<number, { readonly reason: string }>>>
type ToolControlsExcludeAgent = Assert<Equal<Extract<keyof Effect.Success<typeof toolAdmission>, "send" | "fork" | "rewind">, never>>
type ToolAwaitOutput = Assert<Equal<Effect.Success<Effect.Success<typeof toolAdmission>["await"]>, number>>
type ToolAwaitFailure = Assert<Equal<Extract<Effect.Error<Effect.Success<typeof toolAdmission>["await"]>, { readonly _tag: "ToolRunFailure" }>, { readonly _tag: "ToolRunFailure"; readonly failure: { readonly reason: string } }>>
type ComponentsRoot = typeof import("generalist/components")
type ComponentRegistryInternal = Assert<Equal<"Registry" extends keyof ComponentsRoot ? true : false, false>>
type ComponentSessionAuthorityInternal = Assert<Equal<"SessionState" extends keyof ComponentsRoot ? true : false, false>>
type ComponentInternalsAbsent = Assert<Equal<Extract<keyof ComponentsRoot, "Checkpoint" | "bounded" | "namespace" | "validate" | "toolReplayPolicy">, never>>
const component = Components.make({
  descriptor: {
    version: "1", key: "counter", instance: "default", schemaVersion: "1", handler: "increment", handlerVersion: "1",
    scope: "session", access: "session-owner", inheritance: "none", branch: "restore", redaction: "visible",
    maxStateBytes: 64, maxCommandBytes: 64, maxReceiptBytes: 4096,
  },
  state: Schema.Int, command: Schema.Int, initial: 0, transition: (state, command) => state + command,
})
const componentRead = Components.read(component)
const componentCommand = Components.command(component, { command: 1 })
type ComponentReadState = Assert<Equal<Effect.Success<typeof componentRead>, number>>
type ComponentCommandState = Assert<Equal<Effect.Success<typeof componentCommand>, number>>
type ComponentReadServices = Assert<Equal<EffectServices<typeof componentRead>, never>>
type ComponentCommandServices = Assert<Equal<EffectServices<typeof componentCommand>, never>>
const componentTool = Tool.make("counter_add", {
  parameters: Schema.Struct({ amount: Schema.Int }), success: Schema.Int,
  failure: Schema.Union([DurableDriver.DriverError, DurableDriver.DriverStateInvalid]),
}).annotate(Components.CommandTool, component.registration)
const componentToolkit = Toolkit.make(componentTool)
const componentAgent = Agent.make({ name: "component-consumer", toolkit: componentToolkit })
const componentRun = Agent.run(componentAgent, "increment").pipe(Effect.provide(Layer.mergeAll(
  Components.layer([component.registration]),
  componentToolkit.toLayer({ counter_add: ({ amount }) => Components.command(component, { command: amount }) }),
  TestModel.layer([TestModel.toolCall("counter_add", { amount: 1 }), TestModel.text("done")]),
)))
type ComponentAgentServices = Assert<Equal<EffectServices<typeof componentRun>, never>>
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
const s3Options: S3.Options = {
  bucket: "generalist-package-smoke",
  region: "us-east-1",
  credentials: { accessKeyId: "package-smoke", secretAccessKey: "package-smoke" },
}
const s3Layer = S3.layer(s3Options)
const nativeR2Layer = (bucket: R2.Bucket) => R2.layer(bucket)
const objectRuntimeLayer = (options: Durability.Options) =>
  Durability.layer(options).pipe(Layer.provide(s3Layer))
const readOnlyStoreLayer = (options: Durability.Options) =>
  Durability.layerRunStore(options).pipe(Layer.provide(s3Layer))
void nativeR2Layer
void objectRuntimeLayer
void readOnlyStoreLayer
void Durability.activate
void TestDurability.make
void deterministicLayer
void makeModelRoute
const cursor: Cursor.Cursor = Cursor.origin
const serverClient = Server.client({ baseUrl: "https://generalist.test" })
const sessionPages = Effect.gen(function* () {
  const client = yield* serverClient
  const snapshot = yield* client.sessions.snapshot({ sessionId: "package-history" })
  yield* client.sessions.list()
  const created = yield* client.sessions.create({ id: "package-queue", agent: "package-agent" })
  const pending = yield* client.sessions.submit({ sessionId: created.id, input: "pending", commandId: "package-submit" })
  const edited = yield* client.sessions.updateInput({ sessionId: created.id, id: pending.id, input: "edited", commandId: "package-edit", expectedRevision: pending.revision, agent: "package-agent" })
  yield* client.sessions.removeInput({ sessionId: created.id, id: pending.id, commandId: "package-remove", expectedRevision: edited.revision })
  const history = yield* client.sessions.history({ sessionId: snapshot.session.id, leafId: snapshot.conversation.leafId, limit: 64 })
  const runs = yield* client.sessions.runs({ sessionId: snapshot.session.id, at: snapshot.cursor, limit: 32 })
  if (history.nextLeafId !== null) yield* client.sessions.history({ sessionId: snapshot.session.id, leafId: history.nextLeafId, limit: 64 })
  if (runs.nextBefore !== null) yield* client.sessions.runs({ sessionId: snapshot.session.id, at: runs.at, before: runs.nextBefore, limit: 32 })
  for (const entry of history.entries) if (entry.contentDeferred === true) yield* client.sessions.entry({ sessionId: snapshot.session.id, entryId: entry.id })
  for (const run of runs.runs) yield* client.sessions.run({ sessionId: snapshot.session.id, runId: run.runId })
})
void sessionPages
type ServerClientRequirements = Assert<Equal<EffectServices<typeof serverClient>, HttpClient.HttpClient>>
void cursor
void serverClient
void Server.api
void Server.layer
void Server.authBearer({
  token: Config.redacted("TOKEN"),
  principal: { id: "package-smoke", tenantId: "package-smoke", role: "controller" },
})
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
