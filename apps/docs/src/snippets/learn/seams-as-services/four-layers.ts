import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent, LanguageModel, Response } from "@batonfx/core"

const agent = Agent.make({
  name: "minimal-agent",
  instructions: "Reply briefly.",
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "One required layer, nothing else." })),
  }),
)

const layers = Layer.mergeAll(modelLayer)

const program = Agent.generate(agent, { prompt: "Are you fully configured?" }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
