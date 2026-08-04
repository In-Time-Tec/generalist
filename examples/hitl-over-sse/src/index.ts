import { Console, Effect, Layer, Schema, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import {
  Agent,
  Approvals,
  Chat,
  LanguageModel,
  ModelMiddleware,
  Response,
  Tool,
  ToolExecutor,
  Toolkit,
} from "@batonfx/core"
import { Address, AgentHost, ExecutableManifest, ExecutableResolver, RunStore, Runtime } from "@batonfx/runtime"
import { Sse } from "@batonfx/transport"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const executable = ExecutableManifest.makeTest("release-agent", "1")
const agentAddress = Address.make("agent:release")
const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.die("approval should suspend before execution") })
const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)
const persistenceLayer = Chat.layerPersisted({ storeId: "hitl-over-sse" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const agentServices = Layer.mergeAll(
  modelLayer(() =>
    Stream.make(
      Response.makePart("tool-call", {
        id: "deploy-1",
        name: "deploy",
        params: { service: "api" },
        providerExecuted: false,
      }),
      Response.makePart("finish", { reason: "tool-calls", usage, response: { status: 200, headers: {} } }),
    ),
  ),
  toolExecutorLayer,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "approve-deploy-1" }),
  }),
  ModelMiddleware.layerIdentity,
  persistenceLayer,
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent, services: agentServices }]),
  addresses: [{ address: agentAddress, executable }],
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.send({
    to: agentAddress,
    sessionId: "release-1",
    idempotencyKey: "deploy-api-1",
    prompt: "Deploy api",
  })
  const store = yield* RunStore.RunStore
  const host = yield* AgentHost.AgentHost
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "hitl-example" }))
  const events = yield* runtime.events({ runId: receipt.runId }).pipe(
    Stream.takeUntil(
      (event) =>
        event._tag === "RunWaiting" ||
        event._tag === "RunCompleted" ||
        event._tag === "RunFailed" ||
        event._tag === "RunCancelled",
    ),
    Stream.runCollect,
  )
  yield* Console.log(
    `${Sse.streamSuccess._tag}: ${Array.from(events)
      .map((event) => event._tag)
      .join(" -> ")}`,
  )
}).pipe(Effect.provide(runtimeLayer))

await Effect.runPromise(program)
