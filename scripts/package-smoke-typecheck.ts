/** Type-level consumer source used by package smoke without inflating the runner. */
export const packageSmokeTypecheck = (
  exports: ReadonlyArray<string>,
): string => `${exports.map((specifier) => `import ${JSON.stringify(specifier)}`).join("\n")}
import { ActiveModelResponse, Agent, DurableDriver, Handoff, Memory, ModelMiddleware, ModelRegistry, ModelResilience, ModelTelemetry, Session, Tasks, ToolOutput } from "generalist"
import { LanguageModel } from "effect/unstable/ai"
import { A2A } from "generalist/unstable/a2a"
import { AGUI } from "generalist/unstable/ag-ui"
import * as MemoryFeature from "generalist/memory"
import { VectorStore, WorkingMemory as MemoryWorkingMemory } from "generalist/memory"
import { MCPClient, OAuth } from "generalist/unstable/mcp"
import { make as makeMcpHttpTransport } from "generalist/unstable/mcp/client/http"
import { connect as mcpConnect, type MCPTools, type Options as MCPConnectOptions } from "generalist/unstable/mcp/tools"
import { load } from "generalist/instructions"
import { GitHubCatalog, HttpCatalog, S3Catalog, type Limits } from "generalist/instructions/skills"
import { consolidate, type ConsolidationProposer } from "generalist/unstable/learning"
import { layer as deterministicLayer } from "generalist/providers/deterministic"
import { make as makeModelRoute } from "generalist/unstable/providers/model-route"
import { TestModel, Testing } from "generalist/testing"
import { Cursor, Runtime, RunEvent } from "generalist/runtime"
import * as Inspection from "generalist/runtime/inspection"
import type { ClosedNativeError, NativeLayerEnvironment } from "generalist/runtime/native-layer-environment"
import * as Durability from "generalist/durability"
import * as Discovery from "generalist/durability/discovery"
import { ObjectStore, ObjectStoreFailure } from "generalist/durability/object-store"
import * as S3 from "generalist/durability/s3"
import * as R2 from "generalist/durability/r2"
import * as DurableObjects from "generalist/unstable/cloudflare/durable-objects"
import * as Rivet from "generalist/unstable/rivet"
import * as TestDurability from "generalist/testing/durability"
import * as Components from "generalist/components"
import * as AccountAuth from "generalist/unstable/providers/openai-account-auth"
import {
  ClientAgentIdentity,
  ClientApprovalSummary,
  ClientBudget,
  ClientConversation,
  ClientConversationEntry,
  ClientConversationUpdate,
  ClientCursor,
  ClientEvent,
  ClientMessage,
  ClientPreview,
  ClientQueueEntry,
  ClientRun,
  ClientRunSummary,
  ClientServerEvent,
  ClientSession,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  ClientSessionSnapshot,
  ClientUsage,
  ClientWait,
  Server,
  type ClientAgentIdentity as ClientAgentIdentityType,
  type ClientApprovalSummary as ClientApprovalSummaryType,
  type ClientBudget as ClientBudgetType,
  type ClientConversation as ClientConversationType,
  type ClientConversationEntry as ClientConversationEntryType,
  type ClientConversationUpdate as ClientConversationUpdateType,
  type ClientCursor as ClientCursorType,
  type ClientEvent as ClientEventType,
  type ClientMessage as ClientMessageType,
  type ClientPreview as ClientPreviewType,
  type ClientQueueEntry as ClientQueueEntryType,
  type ClientRun as ClientRunType,
  type ClientRunSummary as ClientRunSummaryType,
  type ClientServerEvent as ClientServerEventType,
  type ClientSession as ClientSessionType,
  type ClientSessionHistoryPage as ClientSessionHistoryPageType,
  type ClientSessionRunsPage as ClientSessionRunsPageType,
  type ClientSessionSnapshot as ClientSessionSnapshotType,
  type ClientUsage as ClientUsageType,
  type ClientWait as ClientWaitType,
} from "generalist/server"
import { Host, ToolIdentity, type HostToolRun } from "generalist/host"
import { Config, Context, Crypto, Effect, Layer, Option, Redacted, Schema, Scope, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <Value>() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Assert<Value extends true> = Value
type IsAssignable<Source, Target> = Source extends Target ? true : false
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
type HostedLimits = Assert<
  Equal<keyof Limits, "manifestMaxBytes" | "bodyMaxBytes" | "maxSkills" | "toolsBySkill">
>
const packageLimits: Limits = {
  manifestMaxBytes: 1_048_576,
  bodyMaxBytes: 1_048_576,
  maxSkills: 1_000,
  toolsBySkill: {},
}
const packageGitHubOptions: GitHubCatalog.Options = {
  ...packageLimits,
  owner: "acme",
  repo: "agent-skills",
  ref: "a".repeat(40),
}
const packageHttpOptions: HttpCatalog.Options = { ...packageLimits, manifestUrl: "https://skills.example/skills.json" }
const packageS3Options: S3Catalog.Options = { ...packageLimits, bucket: "company-skills", region: "us-west-2" }
const packageProposer: ConsolidationProposer = consolidate({
  schedule: "FREQ=DAILY",
  window: "1 day",
  model: "summary-model",
  maxProposals: 1,
})
declare const packageSummaryModel: Layer.Layer<LanguageModel.LanguageModel>
const packageAmbientWorking = MemoryWorkingMemory.layer({ summarize: {} })
const packageExplicitWorking = MemoryWorkingMemory.layer({ summarize: { model: packageSummaryModel } })
const packageAmbientMemory = MemoryFeature.layer({ working: { summarize: {} } })
const packageExplicitMemory = MemoryFeature.layer({ working: { summarize: { model: packageSummaryModel } } })
type PackageAmbientWorking = Assert<
  Equal<LayerShape<typeof packageAmbientWorking>, readonly [Memory.Memory, never, LanguageModel.LanguageModel]>
>
type PackageExplicitWorking = Assert<
  Equal<LayerShape<typeof packageExplicitWorking>, readonly [Memory.Memory, never, never]>
>
type PackageAmbientMemory = Assert<
  Equal<
    LayerShape<typeof packageAmbientMemory>,
    readonly [
      Memory.Memory,
      never,
      VectorStore.VectorStore | import("effect/unstable/ai").EmbeddingModel.EmbeddingModel | LanguageModel.LanguageModel,
    ]
  >
>
type PackageExplicitMemory = Assert<
  Equal<
    LayerShape<typeof packageExplicitMemory>,
    readonly [
      Memory.Memory,
      never,
      VectorStore.VectorStore | import("effect/unstable/ai").EmbeddingModel.EmbeddingModel,
    ]
  >
>
void packageGitHubOptions
void packageHttpOptions
void packageS3Options
void packageProposer
void packageAmbientWorking
void packageExplicitWorking
void packageAmbientMemory
void packageExplicitMemory
type StreamServices<Value> = Value extends Stream.Stream<unknown, unknown, infer Services> ? Services : never
type EffectServices<Value> = Value extends Effect.Effect<unknown, unknown, infer Services> ? Services : never
type AccountAuthInternalExport =
  | "issuer"
  | "clientId"
  | "redirectUri"
  | "scopes"
  | "originator"
  | "deviceVerificationUrl"
  | "deviceExchangeRedirect"
  | "credentialFormatVersion"
type AccountAuthPublicKeys = keyof typeof AccountAuth
type AccountAuthInternalExportsRemoved = Assert<
  Equal<Extract<AccountAuthPublicKeys, AccountAuthInternalExport>, never>
>
type AccountAuthRetainedExport =
  | "AuthError"
  | "StoreError"
  | "BrowserAuthorization"
  | "DeviceAuthorizationPresenter"
  | "TokenResponse"
  | "DeviceStartResponse"
  | "DevicePollResponse"
  | "OAuthClient"
  | "CredentialDisk"
  | "CredentialStore"
  | "generatePkce"
  | "authorizationUrl"
  | "OpenAIAccountAuth"
  | "layer"
  | "layerBrowserAuthorizationTest"
  | "layerDeviceAuthorizationPresenterTest"
  | "layerOAuthClientTest"
  | "layerCredentialStoreTest"
type AccountAuthRetainedExportsPresent = Assert<
  Equal<Exclude<AccountAuthRetainedExport, AccountAuthPublicKeys>, never>
>
type AccountAuthError = AccountAuth.AuthError
type AccountAuthStoreError = AccountAuth.StoreError
type AccountAuthFailure = AccountAuth.Error
type AccountAuthAuthorizationResult = AccountAuth.AuthorizationResult
type AccountAuthBrowserAuthorization = AccountAuth.BrowserAuthorization
type AccountAuthDevicePrompt = AccountAuth.DevicePrompt
type AccountAuthDeviceAuthorizationPresenter = AccountAuth.DeviceAuthorizationPresenter
type AccountAuthTokenResponse = AccountAuth.TokenResponse
type AccountAuthDeviceStartResponse = typeof AccountAuth.DeviceStartResponse.Type
type AccountAuthDevicePollResponse = typeof AccountAuth.DevicePollResponse.Type
type AccountAuthOAuthClient = AccountAuth.OAuthClient
type AccountAuthCredentialDisk = typeof AccountAuth.CredentialDisk.Type
type AccountAuthCredential = AccountAuth.Credential
type AccountAuthCredentialStore = AccountAuth.CredentialStore
type AccountAuthStatus = AccountAuth.Status
type AccountAuthService = AccountAuth.OpenAIAccountAuth
type AccountAuthTimingOptions = AccountAuth.TimingOptions
const accountAuthError = AccountAuth.AuthError.make({ kind: "login-required", message: "login required" })
const accountAuthStoreError = AccountAuth.StoreError.make({ kind: "missing", message: "store missing" })
const accountAuthCredential: AccountAuthCredential = {
  accessToken: Redacted.make(""),
  idToken: Redacted.make(""),
  refreshToken: Redacted.make(""),
  accountId: Redacted.make(""),
  fingerprint: "",
  generation: "",
  expiresAt: 0,
  refreshedAt: 0,
}
const accountAuthService: AccountAuthService["Service"] = {
  loginBrowser: (_redirect?: string) => Effect.succeed(accountAuthCredential),
  loginDevice: Effect.succeed(accountAuthCredential),
  status: Effect.succeed({ _tag: "Unauthenticated" }),
  logout: Effect.succeed({ removed: false, revocationSupported: false }),
  acquire: Effect.fail(accountAuthError),
  refreshRejected: (_generation: string) => Effect.fail(accountAuthError),
}
const accountAuthBrowser: AccountAuthBrowserAuthorization["Service"] = {
  authorize: (_url, _state) => Effect.fail(accountAuthError),
}
const accountAuthPresenter: AccountAuthDeviceAuthorizationPresenter["Service"] = {
  device: (_prompt) => Effect.fail(accountAuthError),
}
const accountAuthOAuth: AccountAuthOAuthClient["Service"] = {
  exchange: (_input) => Effect.fail(accountAuthError),
  refresh: (_refreshToken) => Effect.fail(accountAuthError),
  deviceStart: Effect.fail(accountAuthError),
  devicePoll: (_deviceAuthId, _userCode) => Effect.fail(accountAuthError),
}
const accountAuthStore: AccountAuthCredentialStore["Service"] = {
  load: Effect.fail(accountAuthStoreError),
  save: (_value: AccountAuthCredentialDisk) => Effect.fail(accountAuthStoreError),
  remove: Effect.fail(accountAuthStoreError),
  serialized: <A, E, R>(effect: Effect.Effect<A, E, R>) => effect,
}
const accountAuthAliases = {
  AuthError: AccountAuth.AuthError,
  StoreError: AccountAuth.StoreError,
  BrowserAuthorization: AccountAuth.BrowserAuthorization,
  DeviceAuthorizationPresenter: AccountAuth.DeviceAuthorizationPresenter,
  TokenResponse: AccountAuth.TokenResponse,
  DeviceStartResponse: AccountAuth.DeviceStartResponse,
  DevicePollResponse: AccountAuth.DevicePollResponse,
  OAuthClient: AccountAuth.OAuthClient,
  CredentialDisk: AccountAuth.CredentialDisk,
  CredentialStore: AccountAuth.CredentialStore,
  generatePkce: AccountAuth.generatePkce,
  authorizationUrl: AccountAuth.authorizationUrl,
  OpenAIAccountAuth: AccountAuth.OpenAIAccountAuth,
  layer: AccountAuth.layer,
  layerBrowserAuthorizationTest: AccountAuth.layerBrowserAuthorizationTest,
  layerDeviceAuthorizationPresenterTest: AccountAuth.layerDeviceAuthorizationPresenterTest,
  layerOAuthClientTest: AccountAuth.layerOAuthClientTest,
  layerCredentialStoreTest: AccountAuth.layerCredentialStoreTest,
} satisfies Pick<typeof AccountAuth, AccountAuthRetainedExport>
const accountAuthDirectUrl: URL = AccountAuth.authorizationUrl("challenge", Redacted.make("state"))
const accountAuthCurriedUrl: URL = AccountAuth.authorizationUrl(Redacted.make("state"))("challenge")
const accountAuthCredentialSchema: Schema.Schema<AccountAuthCredentialDisk> = AccountAuth.CredentialDisk
const accountAuthTiming: AccountAuthTimingOptions = { deviceTimeout: 1 }
const accountAuthLayers = [
  AccountAuth.layer({ deviceTimeout: 1 }),
  AccountAuth.layerBrowserAuthorizationTest(accountAuthBrowser),
  AccountAuth.layerDeviceAuthorizationPresenterTest(accountAuthPresenter),
  AccountAuth.layerOAuthClientTest(accountAuthOAuth),
  AccountAuth.layerCredentialStoreTest(accountAuthStore),
]
const accountAuthMethods = [
  accountAuthService.loginBrowser(),
  accountAuthService.loginBrowser("http://localhost/callback"),
  accountAuthService.loginDevice,
  accountAuthService.status,
  accountAuthService.logout,
  accountAuthService.acquire,
  accountAuthService.refreshRejected("generation"),
]
void accountAuthAliases
void accountAuthDirectUrl
void accountAuthCurriedUrl
void accountAuthCredentialSchema
void accountAuthTiming
void accountAuthLayers
void accountAuthMethods
void Option.none<
  | AccountAuthError
  | AccountAuthStoreError
  | AccountAuthFailure
  | AccountAuthAuthorizationResult
  | AccountAuthBrowserAuthorization
  | AccountAuthDevicePrompt
  | AccountAuthDeviceAuthorizationPresenter
  | AccountAuthTokenResponse
  | AccountAuthDeviceStartResponse
  | AccountAuthDevicePollResponse
  | AccountAuthOAuthClient
  | AccountAuthCredentialDisk
  | AccountAuthCredential
  | AccountAuthCredentialStore
  | AccountAuthStatus
  | AccountAuthService
  | AccountAuthTimingOptions
>()
const independentTool = Tool.make("package-checks", {
  parameters: Schema.Struct({ count: Schema.FiniteFromString }),
  success: Schema.FiniteFromString,
  failure: Schema.Struct({ reason: Schema.String }),
}).annotate(ToolIdentity, { implementation: "checks-v1", policy: "checks-policy-v1" })
const toolHost = Host.make({ revision: "local", agents: {}, tools: [independentTool] })
const backgroundAgent = Agent.make({ name: "background-consumer", toolkit: Toolkit.make(independentTool), toolExecution: "background" })
type BackgroundRetainsHandlerSchema = Assert<Equal<typeof backgroundAgent.toolkit.tools["package-checks"]["successSchema"]["Type"], number>>
type BackgroundRetainsHandlerFailure = Assert<Equal<typeof backgroundAgent.toolkit.tools["package-checks"]["failureSchema"]["Type"], { readonly reason: string }>>
type ToolHostNeedsNoModel = Assert<Equal<Extract<EffectServices<typeof toolHost>, LanguageModel.LanguageModel>, never>>
const toolAdmission = Effect.gen(function* () {
  const host = yield* toolHost
  return yield* host.tools.start(independentTool, { count: 1 }, { commandId: "package-checks" })
})
type TypedToolHandle = Assert<Equal<Effect.Success<typeof toolAdmission>, HostToolRun<number, { readonly reason: string }>>>
const toolLookup = toolHost.pipe(Effect.flatMap((host) => host.tools.get(independentTool, "retained-tool")))
type TypedToolLookup = Assert<Equal<Effect.Success<typeof toolLookup>, Effect.Success<typeof toolAdmission>>>
type ToolControlsExcludeAgent = Assert<Equal<Extract<keyof Effect.Success<typeof toolAdmission>, "send" | "fork" | "rewind">, never>>
type ToolAwaitOutput = Assert<Equal<Effect.Success<Effect.Success<typeof toolAdmission>["await"]>, number>>
type ToolAwaitFailure = Assert<Equal<Extract<Effect.Error<Effect.Success<typeof toolAdmission>["await"]>, { readonly _tag: "ToolRunFailure" }>, { readonly _tag: "ToolRunFailure"; readonly failure: { readonly reason: string } }>>
declare const actorHost: DurableObjects.Host
const hostedCommand = actorHost.run(Effect.gen(function* () {
  yield* Scope.Scope
  return yield* Runtime.Runtime
}))
type HostedCommandServices = Assert<Equal<EffectServices<typeof hostedCommand>, never>>
type ActorNamespace = Assert<Equal<ReturnType<Rivet.RuntimeActorOptions["namespace"]>, Rivet.RuntimeActorNamespace>>
type FactoryStaticPartitionRemoved = Assert<Equal<"partition" extends keyof Rivet.RuntimeActorOptions ? true : false, false>>
type CustomActorPartition = Assert<Equal<Rivet.ActorRuntimeOptions["partition"], string>>
class RequiredServerAuth extends Context.Service<RequiredServerAuth, { readonly token: string }>()(
  "generalist/package-smoke/RequiredServerAuth",
) {
}
declare const typedServerHost: import("generalist/host").Host<{ readonly background: typeof backgroundAgent }>
const authWithMissingService = Layer.effect(
  Server.Authentication,
  Effect.map(
    RequiredServerAuth,
    () => Server.Authentication.of({ bearer: () => Effect.fail(Server.Unauthorized.make({})) }),
  ),
)
const invalidRivetServerFactory: Rivet.RuntimeActorServerFactory<{ readonly background: typeof backgroundAgent }> = {
  // @ts-expect-error A server factory must return the canonical Host/auth/authorization config.
  make: () => Effect.succeed({ host: typedServerHost }),
}
const missingRivetAuthService: Rivet.RuntimeActorServerOptions<{ readonly background: typeof backgroundAgent }> = {
  host: typedServerHost,
  // @ts-expect-error Auth layer requirements cannot be silently erased from the canonical server config.
  auth: authWithMissingService,
  authorization: { tenantId: "package-smoke", authorize: () => Effect.succeed(true) },
}
void invalidRivetServerFactory
void missingRivetAuthService
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
type MemoryRetainedSurface = readonly [
  Memory.Metadata,
  Memory.Key,
  Memory.OperationRef,
  Memory.Version,
  Memory.ItemPart,
  Memory.Item,
  Memory.RecallInput,
  Memory.RememberInput,
  Memory.ForgetInput,
  Memory.HistoryEntry,
  Memory.RevertInput,
  Memory.MemoryError,
  Memory.Service,
  typeof Memory.OperationRef,
  typeof Memory.Version,
  typeof Memory.MemoryError,
  typeof Memory.Memory,
  typeof Memory.merge,
  typeof Memory.layerNoop,
  typeof Memory.layerTest,
]
type MemoryProvenanceInternal = Assert<
  Equal<
    Extract<
      keyof typeof Memory,
      | "itemFromPromptPart"
      | "messageFromRecall"
      | "isMessageFromRecall"
      | "replaceRecalledMessage"
      | "recalledMessageIdentity"
      | "projectTranscript"
    >,
    never
  >
>
type HandoffRetainedSurface = readonly [
  Handoff.DelegateOptions,
  Handoff.HandoffToolOptions,
  Handoff.FanOutChild,
  Handoff.FanOutJoin,
  Handoff.FanOutRemainder,
  Handoff.FanOutAllSuccessOptions,
  Handoff.FanOutCollectOptions,
  Handoff.FanOutOptions,
  Handoff.FanOutMemberResult,
  Handoff.FanOutUnsatisfied,
  Handoff.Supervisor<never>,
  Handoff.SupervisorOptions,
  Handoff.Registration,
  Handoff.Target,
  Handoff.Catalog,
  typeof Handoff.FanOutUnsatisfied,
  typeof Handoff.Catalog,
  typeof Handoff.delegateTool,
  typeof Handoff.transferTool,
  typeof Handoff.fanOut,
  typeof Handoff.supervisor,
  typeof Handoff.target,
  typeof Handoff.layerCatalog,
  typeof Handoff.defaultContextProjection,
  typeof Handoff.filterContextProjection,
  typeof Handoff.Input,
  Handoff.Input,
  typeof Handoff.Output,
  Handoff.Output,
  typeof Handoff.ProjectionInvalid,
  Handoff.ProjectionInvalid,
  typeof Handoff.Rejected,
  Handoff.Rejected,
  typeof Handoff.register,
  typeof Handoff.RegistrationError,
  Handoff.RegistrationError,
]
type HandoffContinuationInternal = Assert<
  Equal<
    Extract<
      keyof typeof Handoff,
      | "Commit"
      | "ControlState"
      | "HandoffRunState"
      | "toControlState"
      | "fromControlState"
      | "takePendingContinuation"
      | "initialHandoffRunState"
      | "edgeCount"
      | "incrementEdge"
    >,
    never
  >
>
const packageMemoryService: Memory.Service = {
  recall: () => Effect.succeed([]),
  remember: () => Effect.void,
  forget: () => Effect.void,
  history: () => Effect.succeed([]),
  revert: () => Effect.void,
}
const packageMemoryLayer = Memory.layerTest(packageMemoryService)
const mergedPackageMemoryService = Memory.merge(packageMemoryService, packageMemoryService)
const packageHandoffTarget = Handoff.target(Agent.make({ name: "package-handoff-target" }))
const packageHandoffCatalog = Handoff.layerCatalog([packageHandoffTarget])
const packageHandoffTransfer = Handoff.transferTool(packageHandoffTarget)
void packageMemoryLayer
void mergedPackageMemoryService
void packageHandoffCatalog
void packageHandoffTransfer
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
const publicOptionAgent = Agent.make({ name: "public-options", output: Schema.Struct({ summary: Schema.String }) })
const publicMemoryOptions = { memory: { key: { agent: "public-options", subject: "consumer" } } }
const publicAllocationOptions = { prompt: "hello", ...publicMemoryOptions }
const publicAllocation = Agent.allocateRun(publicOptionAgent, publicAllocationOptions)
const curriedPublicAllocation = Agent.allocateRun(publicAllocationOptions)(publicOptionAgent)
type ExpectedPublicAllocation = Effect.Effect<
  Agent.RunHandle<
    import("generalist").AgentEvent.Event<{ readonly summary: string }>,
    Agent.RunError,
    LanguageModel.LanguageModel | Memory.Memory
  >,
  import("generalist").Steering.PolicyInvalid,
  Scope.Scope
>
type PublicAllocationExact = Assert<Equal<typeof publicAllocation, ExpectedPublicAllocation>>
type CurriedPublicAllocationExact = Assert<Equal<typeof curriedPublicAllocation, ExpectedPublicAllocation>>
const publicMemoryStream = Agent.stream(publicOptionAgent, "hello", publicMemoryOptions)
const curriedPublicMemoryStream = Agent.stream("hello", publicMemoryOptions)(publicOptionAgent)
type ExpectedPublicStream = Stream.Stream<
  import("generalist").AgentEvent.Event<{ readonly summary: string }>,
  Agent.RunError,
  LanguageModel.LanguageModel | Memory.Memory
>
type PublicStreamExact = Assert<Equal<typeof publicMemoryStream, ExpectedPublicStream>>
type CurriedPublicStreamExact = Assert<Equal<typeof curriedPublicMemoryStream, ExpectedPublicStream>>
const publicMemoryRun = Agent.run(publicOptionAgent, "hello", publicMemoryOptions)
const curriedPublicMemoryRun = Agent.run("hello", publicMemoryOptions)(publicOptionAgent)
type ExpectedPublicRun = Effect.Effect<
  { readonly summary: string },
  Agent.RunError,
  LanguageModel.LanguageModel | Memory.Memory
>
type PublicRunExact = Assert<Equal<typeof publicMemoryRun, ExpectedPublicRun>>
type CurriedPublicRunExact = Assert<Equal<typeof curriedPublicMemoryRun, ExpectedPublicRun>>
type HostedOptionsAbsent = Assert<Equal<
  Extract<keyof Agent.RunOptions, "initialSteering" | "driverCheckpoint" | "executableRef" | "executableManifest">,
  never
>>
type CapabilityBindingsAbsent = Assert<Equal<Extract<keyof Agent.Any, "capabilities">, never>>
type HandleControlAbsent = Assert<Equal<Extract<keyof Agent.RunHandle, "busy" | "interruptTools" | "reject">, never>>
type InspectorWritesAbsent = Assert<Equal<Extract<keyof Agent.InspectorService, "start" | "publish" | "observe">, never>>
type ParentStateAbsent = Assert<Equal<
  Extract<keyof import("generalist").ToolContext.Service, "history" | "agent" | "inheritedSandboxSnapshot">,
  never
>>
const rejectHostedOptionUnion = (
  options: { readonly sessionId: string } | { readonly sessionId: string; readonly driverCheckpoint: {} },
) => {
  // @ts-expect-error A union containing hosted state cannot enter direct allocation.
  Agent.allocateRun(publicOptionAgent, { prompt: "hello", ...options })
  // @ts-expect-error A union containing hosted state cannot enter curried allocation.
  Agent.allocateRun({ prompt: "hello", ...options })(publicOptionAgent)
  // @ts-expect-error A union containing hosted state cannot enter direct streaming.
  Agent.stream(publicOptionAgent, "hello", options)
  // @ts-expect-error A union containing hosted state cannot enter curried streaming.
  Agent.stream("hello", options)(publicOptionAgent)
  // @ts-expect-error A union containing hosted state cannot enter direct runs.
  Agent.run(publicOptionAgent, "hello", options)
  // @ts-expect-error A union containing hosted state cannot enter curried runs.
  Agent.run("hello", options)(publicOptionAgent)
}
void rejectHostedOptionUnion
void Handoff
type ServerRoot = typeof import("generalist/server")
type RuntimeRoot = typeof import("generalist/runtime")
type A2ARoot = typeof import("generalist/unstable/a2a")
type AGUIRoot = typeof import("generalist/unstable/ag-ui")
type A2ACanonical = Assert<Equal<A2ARoot["A2A"], typeof A2A>>
type AGUICanonical = Assert<Equal<AGUIRoot["AGUI"], typeof AGUI>>
type ServerCanonical = Assert<Equal<ServerRoot["Server"], typeof Server>>
type ClientSessionCanonical = Assert<Equal<ServerRoot["ClientSession"], typeof ClientSession>>
type ClientRunCanonical = Assert<Equal<ServerRoot["ClientRun"], typeof ClientRun>>
type ClientEventCanonical = Assert<Equal<ServerRoot["ClientEvent"], typeof ClientEvent>>
type ClientServerEventCanonical = Assert<Equal<ServerRoot["ClientServerEvent"], typeof ClientServerEvent>>
type ClientSnapshotCanonical = Assert<Equal<ServerRoot["ClientSessionSnapshot"], typeof ClientSessionSnapshot>>
type ClientContractTypes = readonly [
  ClientAgentIdentityType,
  ClientApprovalSummaryType,
  ClientBudgetType,
  ClientConversationType,
  ClientConversationEntryType,
  ClientConversationUpdateType,
  ClientCursorType,
  ClientEventType,
  ClientMessageType,
  ClientPreviewType,
  ClientQueueEntryType,
  ClientRunType,
  ClientRunSummaryType,
  ClientServerEventType,
  ClientSessionType,
  ClientSessionHistoryPageType,
  ClientSessionRunsPageType,
  ClientSessionSnapshotType,
  ClientUsageType,
  ClientWaitType,
]
type ClientSessionInternalFieldsAbsent = Assert<
  Equal<
    Extract<
      keyof ClientSessionType,
      "selection" | "executableRef" | "executableManifest" | "registrations" | "retainedSession"
    >,
    never
  >
>
type ClientRunInternalFieldsAbsent = Assert<
  Equal<
    Extract<
      keyof ClientRunType,
      "executableRef" | "executableManifest" | "registrations" | "ownerId" | "attemptFence" | "checkpoint"
    >,
    never
  >
>
type ClientSnapshotInternalFieldsAbsent = Assert<
  Equal<Extract<keyof ClientSessionSnapshotType["session"], "selection" | "checkpointPath" | "providerResourceRef">, never>
>
type InternalServerContractsAbsent = Assert<
  Equal<Extract<keyof ServerRoot, "HostSessionSnapshot" | "ServerEvent">, never>
>
type InternalServerNamespaceContractsAbsent = Assert<
  Equal<
    Extract<
      keyof typeof Server,
      | "SessionSnapshot"
      | "SessionHistoryPage"
      | "SessionRunsPage"
      | "HostEvent"
      | "PreviewDelivery"
      | "ServerEvent"
      | "CursorFromString"
    >,
    never
  >
>
void [
  ClientAgentIdentity,
  ClientApprovalSummary,
  ClientBudget,
  ClientConversation,
  ClientConversationEntry,
  ClientConversationUpdate,
  ClientCursor,
  ClientMessage,
  ClientPreview,
  ClientQueueEntry,
  ClientRunSummary,
  ClientSessionHistoryPage,
  ClientSessionRunsPage,
  ClientUsage,
  ClientWait,
]
type RuntimeCanonical = Assert<Equal<RuntimeRoot["Runtime"], typeof Runtime>>
type RuntimeInspectionCanonical = Assert<Equal<RuntimeRoot["Inspection"], typeof Inspection>>
type RunEventCanonical = Assert<Equal<RuntimeRoot["RunEvent"], typeof RunEvent>>
type DiscoveryInspection = Effect.Success<ReturnType<typeof Discovery.inspect>>
type DiscoveryInternalsAbsent = Assert<Equal<Extract<keyof DiscoveryInspection, "head" | "state">, never>>
type InspectionContracts = readonly [
  Inspection.Cursor,
  Inspection.RunStatus,
  Inspection.Run,
  Inspection.Child,
  Inspection.Wait,
  Inspection.Session,
  Inspection.Usage,
  Inspection.Budget,
  Inspection.PartitionInspection,
  Inspection.Page<Inspection.Run>,
  Inspection.PageInput,
  Inspection.Service,
  Inspection.Options<ObjectStoreFailure, never>,
  Inspection.RunNotFound,
  Inspection.SessionNotFound,
  Inspection.InspectionUnavailable,
  Inspection.InspectionCorrupt,
  Inspection.InspectionCursorInvalid,
  Inspection.InspectionLimitInvalid,
  Inspection.InspectionFailure,
]
type InspectionInternalsAbsent = Assert<
  Equal<Extract<keyof typeof Inspection, "RuntimeInspectionResponse" | "ChildInspectionResponse">, never>
>
declare const inspectionStorage: Layer.Layer<ObjectStore | Crypto.Crypto, ObjectStoreFailure>
const inspectionLayer = Inspection.layer({
  storage: inspectionStorage,
  namespace: { environment: "package", tenant: "smoke", partition: "inspection" },
})
type InspectionLayerShape = Assert<
  Equal<
    LayerShape<typeof inspectionLayer>,
    readonly [Inspection.Inspection, ObjectStoreFailure | Inspection.InspectionFailure, never]
  >
>
void inspectionLayer
void [
  Inspection.Cursor,
  Inspection.RunStatus,
  Inspection.Run,
  Inspection.Child,
  Inspection.Wait,
  Inspection.Session,
  Inspection.Usage,
  Inspection.Budget,
  Inspection.PartitionInspection,
  Inspection.Page,
  Inspection.PageInput,
  Inspection.Inspection,
  Inspection.RunNotFound,
  Inspection.SessionNotFound,
  Inspection.InspectionUnavailable,
  Inspection.InspectionCorrupt,
  Inspection.InspectionCursorInvalid,
  Inspection.InspectionLimitInvalid,
]
type RuntimeSemanticSurface = Assert<
  Equal<keyof Runtime.Service,
    "start" | "hold" | "schedule" | "inspect" | "list" | "events" | "history" | "previews" |
    "signal" | "respond" | "cancel" | "sessions" | "children" | "messaging" | "operator">
>
type RuntimeHoldInputCanonical = Assert<
  Equal<Parameters<Runtime.Service["hold"]>[2], Runtime.HoldOptions>
>
type RuntimeHeldActivationCanonical = Assert<
  Equal<Parameters<Runtime.HeldRunHandle<string>["activate"]>, [commandId: string]>
>
type RuntimeAuthorityExportsAbsent = Assert<
  Equal<Extract<keyof typeof import("generalist/runtime"), "RunStore" | "RunExecutor" | "LocalScheduler">, never>
>
type RuntimePreviewFenceAbsent = Assert<
  Equal<Extract<keyof Runtime.ModelPreviewFrame, "attemptFence">, never>
>
type RuntimeExecutionScopeSubpath = Assert<
  Equal<import("generalist/runtime/execution-scope").ExecutionScope<Runtime.AgentRegistry>, Runtime.ExecutionScope<Runtime.AgentRegistry>>
>
type RuntimeScopeConstructorsAbsent = Assert<
  Equal<Extract<keyof typeof import("generalist/runtime/execution-scope"), "issue" | "copyRuntimeBinding" | "markRuntimeReady">, never>
>
type ActiveModelResponseReadOnlyService = ActiveModelResponse.Service
const packageActiveModelResponseSnapshot = Effect.flatMap(
  ActiveModelResponse.ActiveModelResponse,
  (service) => service.snapshot,
)
type ActiveModelResponseReadOnlySnapshot = Effect.Success<typeof packageActiveModelResponseSnapshot>
type ActiveModelResponseReadOnlyRequirement = Assert<
  Equal<EffectServices<typeof packageActiveModelResponseSnapshot>, ActiveModelResponse.ActiveModelResponse>
>
type ModelTelemetryRetainedTypes = readonly [
  ModelTelemetry.ProviderUsage,
  ModelTelemetry.CallPurpose,
  ModelTelemetry.FailureCategory,
  ModelTelemetry.FailureClassification,
  ModelTelemetry.FailureDisposition,
  ModelTelemetry.RetryReason,
  ModelTelemetry.FirstOutputKind,
  ModelTelemetry.CompactionTrigger,
  ModelTelemetry.CompactionKind,
  ModelTelemetry.ModelInvocationMethod,
  ModelTelemetry.ModelInvocationStarted,
  ModelTelemetry.ModelInvocationCompleted,
  ModelTelemetry.ModelInvocationFailed,
  ModelTelemetry.CallStarted,
  ModelTelemetry.AttemptStarted,
  ModelTelemetry.AttemptFirstOutput,
  ModelTelemetry.AttemptCompleted,
  ModelTelemetry.AttemptFailed,
  ModelTelemetry.FallbackScheduled,
  ModelTelemetry.CompactionCommit,
  ModelTelemetry.RetryScheduled,
  ModelTelemetry.CallCompleted,
  ModelTelemetry.CallFailed,
  ModelTelemetry.CompactionStarted,
  ModelTelemetry.CompactionSkipped,
  ModelTelemetry.CompactionApplied,
  ModelTelemetry.CompactionFailed,
  ModelTelemetry.Event,
  ModelTelemetry.DeliveryBatch,
  ModelTelemetry.EventPayload,
  ModelTelemetry.Sink,
  ModelTelemetry.SinkFailed,
  ModelTelemetry.InvocationLifecycle,
  ModelTelemetry.InvocationLifecycleFailed,
]
const modelTelemetryRetainedValues = [
  ModelTelemetry.ProviderUsage,
  ModelTelemetry.CallPurpose,
  ModelTelemetry.FailureCategory,
  ModelTelemetry.FailureClassification,
  ModelTelemetry.FailureDisposition,
  ModelTelemetry.RetryReason,
  ModelTelemetry.FirstOutputKind,
  ModelTelemetry.CompactionTrigger,
  ModelTelemetry.CompactionKind,
  ModelTelemetry.ModelInvocationMethod,
  ModelTelemetry.ModelInvocationStarted,
  ModelTelemetry.ModelInvocationCompleted,
  ModelTelemetry.ModelInvocationFailed,
  ModelTelemetry.CallStarted,
  ModelTelemetry.AttemptStarted,
  ModelTelemetry.AttemptFirstOutput,
  ModelTelemetry.AttemptCompleted,
  ModelTelemetry.AttemptFailed,
  ModelTelemetry.FallbackScheduled,
  ModelTelemetry.CompactionCommit,
  ModelTelemetry.RetryScheduled,
  ModelTelemetry.CallCompleted,
  ModelTelemetry.CallFailed,
  ModelTelemetry.CompactionStarted,
  ModelTelemetry.CompactionSkipped,
  ModelTelemetry.CompactionApplied,
  ModelTelemetry.CompactionFailed,
  ModelTelemetry.Event,
  ModelTelemetry.DeliveryBatch,
  ModelTelemetry.Sink,
  ModelTelemetry.SinkFailed,
  ModelTelemetry.layerSinkNoop,
  ModelTelemetry.InvocationLifecycle,
  ModelTelemetry.InvocationLifecycleFailed,
  ModelTelemetry.layerInvocationLifecycleNoop,
  ModelTelemetry.isInvocationLifecycleFailed,
  ModelTelemetry.classifyFailureCategory,
] as const
const packageTelemetrySink: Layer.Layer<ModelTelemetry.Sink> = Layer.succeed(ModelTelemetry.Sink, {
  deliver: (_batch) => Effect.void,
})
const packageInvocationLifecycle: Layer.Layer<ModelTelemetry.InvocationLifecycle> = Layer.succeed(
  ModelTelemetry.InvocationLifecycle,
  {
    beforeAttempt: (_input) => Effect.void,
    completeAttempt: (_input) => Effect.void,
    failAttempt: (_input) => Effect.void,
  },
)
const packageSinkFailed = ModelTelemetry.SinkFailed.make({ message: "telemetry sink unavailable" })
const packageInvocationLifecycleFailed = ModelTelemetry.InvocationLifecycleFailed.make({
  message: "telemetry lifecycle unavailable",
})
declare const packagePreviewRuntime: Pick<Runtime.Service, "previews">
const packagePreviewStream: Stream.Stream<Runtime.ModelPreviewEvent> = packagePreviewRuntime.previews({ runId: "run-42" })
// @ts-expect-error Telemetry instrumentation belongs to the model loop.
void ModelTelemetry.CurrentInstrumentation
// @ts-expect-error Compaction correlation belongs to the model loop.
void ModelTelemetry.CurrentCompactionId
// @ts-expect-error Summary-call correlation belongs to the model loop.
void ModelTelemetry.CurrentSummaryCall
// @ts-expect-error Summary-call state is not part of the public telemetry contract.
type PackageSummaryCallCell = ModelTelemetry.SummaryCallCell
// @ts-expect-error Active response construction belongs to the hosted model loop.
void ActiveModelResponse.make
void modelTelemetryRetainedValues
void packageTelemetrySink
void packageInvocationLifecycle
void packageSinkFailed
void packageInvocationLifecycleFailed
void packagePreviewStream
void Option.none<ModelTelemetryRetainedTypes | ActiveModelResponseReadOnlyRequirement | ActiveModelResponseReadOnlySnapshot>()
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
class PackageCredentials extends Context.Service<PackageCredentials, { readonly profile: string }>()(
  "generalist/package-smoke/PackageCredentials",
) {}
class PackageRevisionRegistry extends Context.Service<
  PackageRevisionRegistry,
  { readonly deployment: string }
>()("generalist/package-smoke/PackageRevisionRegistry") {}
class PackageModelLayerError extends Schema.TaggedError<PackageModelLayerError>()(
  "generalist/package-smoke/PackageModelLayerError",
  { model: Schema.String },
) {}
class PackageRevisionError extends Schema.TaggedError<PackageRevisionError>()(
  "generalist/package-smoke/PackageRevisionError",
  { revision: Schema.String },
) {}
class PackageEnvironmentError extends Schema.TaggedError<PackageEnvironmentError>()(
  "generalist/package-smoke/PackageEnvironmentError",
  { profile: Schema.String },
) {}
const fallibleAgent = Agent.make({ name: "fallible-package-agent" })
declare const fallibleModelLayer: Layer.Layer<
  LanguageModel.LanguageModel,
  PackageModelLayerError,
  PackageCredentials
>
const uncurriedFallibleAgent = Agent.close(fallibleAgent, fallibleModelLayer)
const curriedFallibleAgent = Agent.close(fallibleModelLayer)(fallibleAgent)
const missingAgentEnvironment = Agent.close(Layer.empty)
type UncurriedClosureError = Assert<
  Equal<
    typeof uncurriedFallibleAgent extends Agent.Closed<infer Error, infer _Requirements> ? Error : never,
    PackageModelLayerError
  >
>
type CurriedClosureRequirements = Assert<
  Equal<
    typeof curriedFallibleAgent extends Agent.Closed<infer _Error, infer Requirements> ? Requirements : never,
    PackageCredentials
  >
>
type MissingAgentServiceRejected = Assert<
  Equal<IsAssignable<typeof fallibleAgent, Parameters<typeof missingAgentEnvironment>[0]>, false>
>
type FallibleClosureIsNotInfallible = Assert<
  Equal<IsAssignable<typeof uncurriedFallibleAgent, Agent.Closed<never, never>>, false>
>
type S3LayerFailure = Assert<Equal<Layer.Error<typeof s3Layer>, ObjectStoreFailure>>
const fallibleAgents = { "fallible-package-agent": fallibleAgent } as const
const loadRevision: Runtime.RevisionLoader<
  typeof fallibleAgents,
  PackageRevisionError,
  PackageRevisionRegistry,
  PackageModelLayerError,
  PackageCredentials
> = (request) =>
  PackageRevisionRegistry.pipe(
    Effect.flatMap(() =>
      request.revision === "fallible-package-v1"
        ? Effect.succeed({
            _tag: "Found" as const,
            definition: {
              agents: fallibleAgents,
              revision: "fallible-package-v1",
              services: fallibleModelLayer,
            },
          })
        : Effect.fail(PackageRevisionError.make({ revision: request.revision })),
    ),
  )
const fallibleRuntimeLayer = Runtime.layer({
  agents: fallibleAgents,
  revision: "fallible-package-v2",
  services: fallibleModelLayer,
  storage: Layer.merge(s3Layer, cryptoLayer),
  namespace: { environment: "package", tenant: "consumer", partition: "fallible" },
  loadRevision,
})
type FallibleRuntimeRequirements = Assert<
  Equal<Layer.Services<typeof fallibleRuntimeLayer>, PackageCredentials | PackageRevisionRegistry>
>
type RuntimeModelFailure = Assert<
  Equal<Extract<Layer.Error<typeof fallibleRuntimeLayer>, PackageModelLayerError>, PackageModelLayerError>
>
type RuntimeStorageFailure = Assert<
  Equal<Extract<Layer.Error<typeof fallibleRuntimeLayer>, ObjectStoreFailure>, ObjectStoreFailure>
>
type RuntimeRevisionFailure = Assert<
  Equal<Extract<Layer.Error<typeof fallibleRuntimeLayer>, PackageRevisionError>, PackageRevisionError>
>
const closingNativeLayer = Layer.effect(
  PackageCredentials,
  Effect.fail(PackageEnvironmentError.make({ profile: "native" })),
)
const nativeLayerEnvironment: NativeLayerEnvironment<PackageCredentials, PackageEnvironmentError> = {
  environment: closingNativeLayer,
}
type MissingNativeEnvironmentRejected = Assert<
  Equal<
    IsAssignable<Record<never, never>, NativeLayerEnvironment<PackageCredentials, PackageEnvironmentError>>,
    false
  >
>
type WrongNativeEnvironmentRejected = Assert<
  Equal<
    IsAssignable<
      { readonly environment: Layer.Layer<PackageRevisionRegistry> },
      NativeLayerEnvironment<PackageCredentials, PackageEnvironmentError>
    >,
    false
  >
>
type NativeFailureUnion = Assert<
  Equal<
    ClosedNativeError<Layer.Error<typeof fallibleRuntimeLayer>, PackageEnvironmentError>,
    Layer.Error<typeof fallibleRuntimeLayer> | PackageEnvironmentError
  >
>
void uncurriedFallibleAgent
void curriedFallibleAgent
void fallibleRuntimeLayer
void nativeLayerEnvironment
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

export const packageSmokeInternalContracts = `import { Handoff, Memory } from "generalist"
void Memory.itemFromPromptPart
void Memory.messageFromRecall
void Memory.isMessageFromRecall
void Memory.replaceRecalledMessage
void Memory.recalledMessageIdentity
void Memory.projectTranscript
void Handoff.Commit
void Handoff.ControlState
void Handoff.toControlState
void Handoff.fromControlState
void Handoff.takePendingContinuation
void Handoff.initialHandoffRunState
void Handoff.edgeLabel
void Handoff.edgeCount
void Handoff.incrementEdge
type HandoffRunState = Handoff.HandoffRunState
type HandoffFrame = Handoff.HandoffFrame
type HandoffEdgeCount = Handoff.HandoffEdgeCount
`

export const packageSmokeTypecheckFailures = (): string => `import { Effect } from "effect"
import { defaults } from "generalist/instructions/skills"
import type { WorkingRequirement } from "generalist/memory"
import type { ConsolidationProposer } from "generalist/unstable/learning"

type MissingWorkingRequirement = WorkingRequirement<never>
type MissingSummaryRequirement = import("generalist/memory").WorkingMemory.SummaryRequirement<
  import("generalist/memory").WorkingMemory.Options
>
const arbitraryProposer: ConsolidationProposer = () => Effect.succeed([])
void defaults
void arbitraryProposer
declare function usePrivateTypes(
  working: MissingWorkingRequirement,
  summary: MissingSummaryRequirement,
): void
void usePrivateTypes
`
