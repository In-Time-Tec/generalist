import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, LanguageModel, Memory, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"
import { WorkingMemory } from "@batonfx/memory"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const key: Memory.Key = { agent: "memory-agent", subject: "user-ada" }
const agent = Agent.make({ name: "memory-agent" })

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, { prompt: "Ada likes Effect.", memory: { key } })
  const second = yield* Agent.generate(agent, { prompt: "What should you remember?", memory: { key } })
  yield* Console.log(second.text)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer((options) => {
        const content = JSON.stringify(options.prompt.content)
        const text = content.includes("Ada likes Effect") ? "I remember that Ada likes Effect." : "Stored that fact."
        return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: text }))
      }),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      WorkingMemory.layer({ maxMessages: 4 }),
    ),
  ),
)

await Effect.runPromise(program)
