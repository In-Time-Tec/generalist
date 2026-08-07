import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const applicationLayer = Layer.mergeAll(
  Agent.layerRuntime,
  TestModel.layer([TestModel.text("I will remember that."), TestModel.text("Your name is Ada.")]),
  Chat.layerPersisted({ storeId: "composition-guide-chats" }).pipe(Layer.provide(Persistence.layerBackingMemory)),
)

const agent = Agent.make({ name: "assistant", instructions: "Answer concisely." })

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, {
    prompt: "My name is Ada.",
    persistence: { chatId: "user-42" },
  })
  const result = yield* Agent.generate(agent, {
    prompt: "What is my name?",
    persistence: { chatId: "user-42" },
  })
  yield* Console.log(result.text)
})

const runtime = ManagedRuntime.make(applicationLayer)
await runtime.runPromise(program)
