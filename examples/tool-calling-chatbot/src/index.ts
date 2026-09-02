import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(weatherTool)

const toolkitLayer = toolkit.toLayer({
  get_weather: ({ city }) => Effect.succeed(`sunny and 72°F for ${city}`),
})

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit,
})

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Should I bring a jacket in Boise?")
  yield* Console.log(result)
})

const runtimeLayer = Layer.mergeAll(
  TestModel.layer([
    TestModel.toolCall("get_weather", { city: "Boise" }, { id: "weather-1" }),
    TestModel.text("Boise is sunny and 72°F; no jacket needed."),
  ]),
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
