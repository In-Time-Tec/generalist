import { Console, Effect, Layer, Stream } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { Address, AgentHost, ExecutableManifest, ExecutableResolver, RunStore, Runtime } from "@batonfx/runtime"
import { TestModel } from "@batonfx/test"
import { Sse } from "@batonfx/transport"

const agent = Agent.make({ name: "transport-agent" })
const executable = ExecutableManifest.makeTest("transport-agent", "1")
const agentAddress = Address.make("agent:transport-guide")
const agentServices = Layer.mergeAll(
  TestModel.layer([TestModel.text("Hello from transport.")]),
  Chat.layerPersisted({ storeId: "composition-guide-sessions" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const runtimeLayer = Runtime.layerMemory({
  resolver: ExecutableResolver.makeStatic([{ executable, agent, services: agentServices }]),
  addresses: [{ address: agentAddress, executable }],
  subscriberQueueCapacity: 16,
})

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const receipt = yield* runtime.send({
    to: agentAddress,
    sessionId: "guide-session",
    idempotencyKey: "guide-message-1",
    prompt: "Say hello",
  })
  const store = yield* RunStore.RunStore
  const host = yield* AgentHost.AgentHost
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "composition-guide" }))
  const first = yield* runtime.events({ runId: receipt.runId }).pipe(Stream.take(1), Stream.runCollect)
  yield* Console.log(
    `admitted ${receipt.runId}; first event: ${Array.from(first)[0]?._tag}; SSE schema: ${Sse.streamSuccess._tag}`,
  )
}).pipe(Effect.provide(runtimeLayer))

await Effect.runPromise(program)
