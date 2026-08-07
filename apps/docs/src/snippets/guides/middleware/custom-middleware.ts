import { Console, Effect, Layer, ManagedRuntime, Option, Stream } from "effect"
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
})

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layer([dropReasoning]),
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
