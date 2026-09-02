import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"

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

const program = Agent.run(agent, "Are you fully configured?").pipe(Effect.flatMap((result) => Console.log(result)))

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
