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
import { Address, AgentHost, AgentRef, Cursor, RunStore, Runtime } from "@batonfx/runtime"

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const agentRef = AgentRef.make({ id: "release-agent", version: "1", digest: "sha256:release-agent" })
const agentAddress = Address.make("agent:release")
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
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "deploy-token-1" }),
  }),
  ModelMiddleware.layerIdentity,
  Chat.layerPersisted({ storeId: "approval-demo" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const runtimeLayer = Runtime.layerMemory({
  agents: [{ ref: agentRef, agent, services: agentServices }],
  addresses: [{ address: agentAddress, agent: agentRef }],
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.send({
    to: agentAddress,
    sessionId: "release-1",
    idempotencyKey: "deploy-1",
    prompt: "Deploy the api service",
  })
  const store = yield* RunStore.RunStore
  const host = yield* AgentHost.AgentHost
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-example" }))
  const firstRun = yield* runtime.events({ runId: receipt.runId }).pipe(
    Stream.takeUntil((event) => event._tag === "RunWaiting"),
    Stream.runCollect,
  )
  const waiting = Array.from(firstRun).find((event) => event._tag === "RunWaiting")
  if (waiting === undefined || waiting._tag !== "RunWaiting") {
    return yield* Effect.die("expected a RunWaiting event")
  }
  yield* Console.log(`waiting for ${waiting.wait.reason} on ${waiting.wait.waitId}`)
  yield* runtime.respond({ runId: receipt.runId, waitId: waiting.wait.waitId, resolution: { _tag: "Approved" } })
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "approval-example" }))
  const secondRun = yield* runtime.events({ runId: receipt.runId, cursor: Cursor.make(waiting.sequence) }).pipe(
    Stream.takeUntil((event) => event._tag === "RunCompleted"),
    Stream.runCollect,
  )
  const completed = Array.from(secondRun).find((event) => event._tag === "RunCompleted")
  if (completed === undefined || completed._tag !== "RunCompleted") {
    return yield* Effect.die("expected a RunCompleted event")
  }
  yield* Console.log(completed.result.text)
}).pipe(Effect.provide(runtimeLayer))

await Effect.runPromise(program)
