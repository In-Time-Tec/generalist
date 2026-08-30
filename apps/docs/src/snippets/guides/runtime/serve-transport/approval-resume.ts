import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import {
  Agent,
  AgentManifest,
  Approvals,
  LanguageModel,
  ModelMiddleware,
  Pins,
  Response,
  Tool,
  ToolExecutor,
  Toolkit,
} from "tenetkit"
import { RunExecutor, ExecutableManifest, ExecutableResolver, Cursor, RunStore, Runtime } from "tenetkit/runtime"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ fixture: "release-agent", revision: "1" }),
  tools: [{ name: deployTool.name, pin: Pins.makeCapability({ tool: deployTool.name, version: "1" }) }],
  skills: [],
  services: [],
  policy: { _tag: "Portable", policy: agent.policy.snapshot! },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({ root: pinnedAgent.pin, entries: [{ _tag: "Agent", ...pinnedAgent }] })
const registrations = executable.manifest.entries.flatMap((entry) =>
  entry._tag === "Agent"
    ? [
        entry.manifest.model,
        ...entry.manifest.tools.map(({ pin }) => pin),
        ...(entry.manifest.policy._tag === "Pinned" ? [entry.manifest.policy.pin] : []),
      ].map((pin) => ({ pin, codec: "docs", version: "1", payload: { fixture: "release-agent" } }))
    : [],
)
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
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "deploy-token-1" }),
  }),
  ModelMiddleware.layerIdentity,
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent: Agent.close(agent, agentServices) }]),
  addresses: [],
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.start({
    executable,
    registrations,
    sessionId: "release-1",
    idempotencyKey: "deploy-1",
    prompt: "Deploy the api service",
  })
  const store = yield* RunStore.RunStore
  const host = yield* RunExecutor.RunExecutor
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-example" }))
  const firstRun = yield* runtime.events({ runId: receipt.runId }).pipe(
    Stream.takeUntil((event) => event._tag === "RunWaiting"),
    Stream.runCollect,
  )
  const waiting = Array.from(firstRun).find((event) => event._tag === "RunWaiting")
  if (waiting === undefined || waiting._tag !== "RunWaiting") {
    return yield* Effect.die("expected a RunWaiting event")
  }
  yield* Console.log(`waiting for ${waiting.wait.reason._tag} on ${waiting.wait.waitId}`)
  yield* runtime.respond({ runId: receipt.runId, waitId: waiting.wait.waitId, resolution: { _tag: "Approved" } })
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-example" }))
  const secondRun = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.make(waiting.sequence) }).pipe(
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
