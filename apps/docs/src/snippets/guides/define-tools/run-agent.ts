import { Console, Effect, Layer, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response } from "@batonfx/core"
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
  const result = yield* Agent.generate(agent, { prompt: "Where are toolkits documented?" })
  yield* Console.log(result.text)
}).pipe(Effect.provide(Layer.mergeAll(modelLayer, docsToolLayer, Approvals.autoApprove, ModelMiddleware.identityLayer)))

await Effect.runPromise(program)
