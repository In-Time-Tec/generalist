import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { Agent } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { docsToolLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the documentation search tool.",
  toolkit,
})

let calls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "search-1",
              name: "search_docs",
              params: { query: "toolkits" },
              providerExecuted: false,
            }),
          )
        : Stream.make(
            Response.makePart("text-delta", {
              id: "assistant",
              delta: "See: How to define tools and toolkits.",
            }),
          )
    },
  }),
)

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Where are toolkits documented?")
  yield* Console.log(result)
})

const runtime = ManagedRuntime.make(Layer.mergeAll(modelLayer, docsToolLayer))
await runtime.runPromise(program)
