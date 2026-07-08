import { Console, Effect, Layer, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware } from "@batonfx/core"
import { toolExecutorLayer } from "./executor"
import { toolkit } from "./search-tool"

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the documentation search tool.",
  toolkit,
})

let calls = 0

const modelLayer = Layer.effect(
  Ai.LanguageModel.LanguageModel,
  Ai.LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      calls += 1
      return calls === 1
        ? Stream.make(
            Ai.Response.makePart("tool-call", {
              id: "search-1",
              name: "search_docs",
              params: { query: "toolkits" },
              providerExecuted: false,
            }),
          )
        : Stream.make(
            Ai.Response.makePart("text-delta", {
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
}).pipe(
  Effect.provide(Layer.mergeAll(modelLayer, toolExecutorLayer, Approvals.autoApprove, ModelMiddleware.identityLayer)),
)

await Effect.runPromise(program)
