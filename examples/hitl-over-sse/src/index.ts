import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Generalist } from "generalist/host"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"

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
const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.die("approval should suspend before execution") })
const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
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
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "approve-deploy-1" }),
  }),
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  agentServices,
)

const program = Effect.gen(function* () {
  const host = yield* Generalist.create({ agents: [agent] })
  const session = yield* host.sessions.create({ id: "release-1" })
  yield* host.runs.start(session.id, agent, "Deploy api", { idempotencyKey: "deploy-api-1" })
  const events = yield* host.events.subscribe(session.id).pipe(
    Stream.takeUntil((event) => event._tag === "ApprovalRequested" || event._tag === "Completed"),
    Stream.runCollect,
  )
  const collected = Array.from(events)
  const final = collected.at(-1)
  if (final === undefined) return yield* Effect.die("expected one Host event")
  const encoded = yield* Server.eventCodec.encode(final)
  yield* Console.log(
    `Server HostEvents: ${collected.map((event) => event._tag).join(" -> ")}; final wire bytes: ${encoded.length}`,
  )
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
