import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(weatherTool)

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("get_weather", { city: "Boise" }, { id: "weather-1" }),
  TestModel.text("Boise is sunny and 72°F; no jacket needed."),
])

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`sunny and 72°F in ${city}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Should I bring a jacket in Boise?")
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
