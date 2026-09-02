import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "generalist"
import { TestModel } from "generalist/testing"

const agent = Agent.make({
  name: "minimal-agent",
  instructions: "Reply briefly.",
})

const modelLayer = TestModel.layer([TestModel.text("One required layer, nothing else.")])

const layers = Layer.mergeAll(modelLayer)

const program = Agent.run(agent, "Are you fully configured?").pipe(Effect.flatMap((result) => Console.log(result)))

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
