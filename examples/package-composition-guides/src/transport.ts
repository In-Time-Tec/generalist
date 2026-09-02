import { Console, Effect, Layer, ManagedRuntime, Option, Stream } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "transport-agent" })
const agentServices = TestModel.layer([TestModel.text("Hello from transport.")])

const runtimeLayer = Layer.merge(
  Runtime.layerMemory({
    addresses: [],
    subscriberQueueCapacity: 16,
  }).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie))),
  Layer.mergeAll(agentServices, Permissions.layerAllowAll, Approvals.layerAutoApprove),
)

const program = Effect.gen(function* () {
  const host = yield* Generalist.create({ agents: [agent] })
  const session = yield* host.sessions.create({ id: "guide-session" })
  const handle = yield* host.runs.start(session.id, agent, "Say hello", { idempotencyKey: "guide-message-1" })
  const first = yield* host.events.subscribe(session.id).pipe(Stream.take(1), Stream.runHead)
  const encoded = yield* Server.eventCodec.encode(Option.getOrThrow(first))
  yield* Console.log(
    `admitted ${handle.id}; first Server event: ${first.pipe(
      Option.map((event) => event._tag),
      Option.getOrUndefined,
    )}; wire bytes: ${encoded.length}`,
  )
})

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
await runtime.dispose()
