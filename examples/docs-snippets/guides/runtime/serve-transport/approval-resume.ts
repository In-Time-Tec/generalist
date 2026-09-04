import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Cursor, ExecutableResolver, Runtime } from "generalist/runtime"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "deploy-1",
              name: "deploy",
              params: { service: "api" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: { status: 200, headers: {} } }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Deployed api to production." }),
            Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
          )
    },
  }),
)

const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.succeed("deployed") })
const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)

const agentServices = Layer.mergeAll(
  toolkitLayer,
  modelLayer,
  toolExecutorLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "deploy-token-1" }),
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
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "Deploy the api service", {
    sessionId: "release-1",
    idempotencyKey: "deploy-1",
  })
  const firstRun = yield* handle.events.pipe(
    Stream.takeUntil((event) => event._tag === "RunWaiting"),
    Stream.runCollect,
  )
  const waiting = Array.from(firstRun).find((event) => event._tag === "RunWaiting")
  if (waiting === undefined || waiting._tag !== "RunWaiting") {
    return yield* Effect.die("expected a RunWaiting event")
  }
  yield* Console.log(`waiting for ${waiting.wait.reason._tag} on ${waiting.wait.waitId}`)
  yield* runtime.respond({ runId: handle.runId, waitId: waiting.wait.waitId, resolution: { _tag: "Approved" } })
  const secondRun = yield* runtime.events({ runId: handle.runId, cursor: Cursor.make(waiting.sequence) }).pipe(
    Stream.takeUntil((event) => event._tag === "RunCompleted"),
    Stream.runCollect,
  )
  const completed = Array.from(secondRun).find((event) => event._tag === "RunCompleted")
  if (completed === undefined || completed._tag !== "RunCompleted" || "_tag" in completed.result) {
    return yield* Effect.die("expected an Agent RunCompleted event")
  }
  yield* Console.log(completed.result.text)
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
