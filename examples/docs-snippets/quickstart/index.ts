import { Console, Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { layer as testModel, text, toolCall } from "generalist/testing/model"

const weather = Tool.make("get_weather", {
  description: "Get the weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})
const toolkit = Toolkit.make(weather)

const assistant = Agent.make({
  name: "weather-assistant",
  instructions: "Answer using the weather tool.",
  toolkit,
})

const services = Layer.mergeAll(
  testModel([toolCall("get_weather", { city: "Boise" }), text("Boise is sunny and 72°F; no jacket needed.")]),
  toolkit.toLayer({ get_weather: ({ city }) => Effect.succeed(`Sunny and 72°F in ${city}`) }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

await Agent.run(assistant, "Should I bring a jacket in Boise?").pipe(
  Effect.provide(services),
  Effect.flatMap(Console.log),
  Effect.runPromise,
)
