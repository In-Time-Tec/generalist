import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions } from "generalist"
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
  TestModel.text("Boise is sunny and 72°F."),
  TestModel.text("You asked about Boise."),
])

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ get_weather: () => Effect.succeed("sunny and 72°F") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const program = Effect.gen(function* () {
  const events = yield* Agent.stream(agent, "What is the weather in Boise?").pipe(Stream.runCollect)
  const first = Array.from(events).findLast((event) => event._tag === "Completed")
  if (first?._tag !== "Completed") return yield* Effect.die("expected a completed run")
  yield* Console.log(first.output)
  yield* Console.log(first.transcript.content.map((message) => message.role).join(" "))
  const second = yield* Agent.run(agent, "Which city did I ask about?", {
    history: first.transcript,
  })
  yield* Console.log(second)
})

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
