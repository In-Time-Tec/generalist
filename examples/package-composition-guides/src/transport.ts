import { Console, Effect, Layer } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { TestModel } from "@batonfx/test"
import { SessionRegistry } from "@batonfx/transport"

const agentServices = Layer.mergeAll(
  TestModel.layer([TestModel.text("Hello from transport.")]),
  Chat.layerPersisted({ storeId: "composition-guide-sessions" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const registryLayer = SessionRegistry.layerMemory({
  agent: Agent.make("transport-agent"),
  onConcurrentMessage: "enqueue",
  pendingMessageCapacity: 16,
  maxConcurrentRuns: 4,
}).pipe(Layer.provide(agentServices))

const program = SessionRegistry.SessionRegistry.use((registry) =>
  registry
    .open({ sessionId: "guide-session" })
    .pipe(Effect.flatMap((session) => Console.log(`opened ${session.sessionId}`))),
).pipe(Effect.provide(registryLayer))

await Effect.runPromise(program)
