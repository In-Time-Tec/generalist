import { runMain } from "@effect/platform-bun/BunRuntime"
import { Console, Schema } from "effect"
import { Agent, Tool, Toolkit } from "generalist"

const weatherTool = Tool.make("get_weather", {
  description: "Get local weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "weather-assistant",
  instructions: "Answer with the weather returned by tools.",
  toolkit: Toolkit.make(weatherTool),
})

runMain(Console.log(agent.name))
