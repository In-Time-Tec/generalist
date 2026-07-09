import { Console, Effect, Layer, Option, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"

const dropReasoning: ModelMiddleware.Middleware = {
  transformPart: (part) => Effect.succeed(part.type === "reasoning-delta" ? Option.none() : Option.some(part)),
}

const agent = Agent.make({ name: "terse-agent" })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("reasoning-delta", { id: "thinking", delta: "Considering the question at length." }),
        Response.makePart("text-delta", { id: "assistant", delta: "Blue." }),
      ),
  }),
)

const program = Effect.gen(function* () {
  const events = yield* Stream.runCollect(Agent.stream(agent, { prompt: "Favorite color?" }))
  const partTypes = events.filter((event) => event._tag === "ModelPart").map((event) => event.part.type)
  yield* Console.log(`model parts seen by the loop: ${partTypes.join(", ")}`)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("this agent has no tools") }),
      Approvals.autoApprove,
      ModelMiddleware.layer([dropReasoning]),
    ),
  ),
)

await Effect.runPromise(program)
