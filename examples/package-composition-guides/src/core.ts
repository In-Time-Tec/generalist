import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Session } from "tenetkit"
import { TestModel } from "tenetkit/test"

const applicationLayer = Layer.mergeAll(
  TestModel.layer([TestModel.text("I will remember that."), TestModel.text("Your name is Ada.")]),
  Session.layerMemory,
)

const agent = Agent.make({ name: "assistant", instructions: "Answer concisely." })

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, {
    prompt: "My name is Ada.",
    sessionId: "user-42",
  })
  const result = yield* Agent.generate(agent, {
    prompt: "What is my name?",
    sessionId: "user-42",
  })
  yield* Console.log(result.text)
})

const runtime = ManagedRuntime.make(applicationLayer)
await runtime.runPromise(program)
