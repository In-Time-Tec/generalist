import { Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent } from "@batonfx/core"

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

console.log(agent.name)
