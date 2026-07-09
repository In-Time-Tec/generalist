import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, LanguageModel, Memory, ModelMiddleware, Response, ToolExecutor } from "@batonfx/core"
import { WorkingMemory } from "@batonfx/memory"

const key: Memory.Key = { agent: "support-agent", subject: "user-ada" }

const agent = Agent.make({ name: "support-agent" })

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const content = JSON.stringify(options.prompt.content)
      const text = content.includes("Ada prefers dark mode") ? "Ada prefers dark mode." : "Noted."
      return Stream.make(Response.makePart("text-delta", { id: "assistant", delta: text }))
    },
  }),
)

const program = Effect.gen(function* () {
  yield* Agent.generate(agent, { prompt: "Ada prefers dark mode.", memory: { key } })
  const second = yield* Agent.generate(agent, { prompt: "What do you remember about Ada?", memory: { key } })
  yield* Console.log(second.text)
}).pipe(
  Effect.provide(
    Layer.mergeAll(
      modelLayer,
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      WorkingMemory.layer({ maxMessages: 8 }),
    ),
  ),
)

await Effect.runPromise(program)
