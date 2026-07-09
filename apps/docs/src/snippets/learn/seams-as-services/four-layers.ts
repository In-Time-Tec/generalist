import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

const agent = Agent.make({
  name: "minimal-agent",
  instructions: "Reply briefly.",
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "Four layers, nothing else." })),
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
)

const program = Agent.generate(agent, { prompt: "Are you fully configured?" }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(layers),
)

await Effect.runPromise(program)
