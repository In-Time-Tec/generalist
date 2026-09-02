import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { TestModel } from "generalist/testing"
import { SSE } from "generalist/unstable/transport"

const agent = Agent.make({ name: "transport-agent" })
const agentServices = TestModel.layer([TestModel.text("Hello from transport.")])

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
    subscriberQueueCapacity: 16,
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  agentServices,
)

const program = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(agent)
  const handle = yield* runtime.start(agent, "Say hello", {
    sessionId: "guide-session",
    idempotencyKey: "guide-message-1",
  })
  const first = yield* handle.events.pipe(Stream.take(1), Stream.runCollect)
  yield* Console.log(
    `admitted ${handle.runId}; first event: ${Array.from(first)[0]?._tag}; SSE schema: ${SSE.streamSuccess._tag}`,
  )
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
