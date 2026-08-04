import { Console, Effect, Layer, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Approvals, Chat, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"
import { Address, AgentHost, ExecutableManifest, ExecutableResolver, Cursor, RunStore, Runtime } from "@batonfx/runtime"

const agent = Agent.make({ name: "chat-agent" })
const executable = ExecutableManifest.makeTest("chat-agent", "1")
const agentAddress = Address.make("agent:chat")
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Hello from Baton." }),
        Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
      ),
  }),
)

const persistenceLayer = Chat.layerPersisted({ storeId: "serve-transport-demo" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
  persistenceLayer,
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent, services: agentServices }]),
  addresses: [{ address: agentAddress, executable }],
})

const collectRun = (runId: string, cursor?: number) =>
  Runtime.Runtime.use((runtime) =>
    runtime.events({ runId, ...(cursor === undefined ? {} : { cursor: Cursor.make(cursor) }) }).pipe(
      Stream.takeUntil((event) => event._tag === "RunCompleted"),
      Stream.runCollect,
    ),
  )

const tags = (events: Iterable<{ readonly sequence: number; readonly _tag: string }>) =>
  Array.from(events)
    .map((event) => `${event.sequence}:${event._tag}`)
    .join(" ")

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.send({
    to: agentAddress,
    sessionId: "docs-1",
    idempotencyKey: "hello-1",
    prompt: "Say hello",
  })
  const store = yield* RunStore.RunStore
  const host = yield* AgentHost.AgentHost
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "docs-example" }))
  const live = yield* collectRun(receipt.runId)
  yield* Console.log(`live:   ${tags(live)}`)
  const replayed = yield* collectRun(receipt.runId, 2)
  yield* Console.log(`replay: ${tags(replayed)}`)
}).pipe(Effect.provide(runtimeLayer))

await Effect.runPromise(program)
