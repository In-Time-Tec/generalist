import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, type AgentEvent, Approvals, ModelMiddleware, ToolExecutor } from "@batonfx/core"

const searchTool = Ai.Tool.make("search_docs", {
  description: "Search the project docs",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the search results.",
  toolkit: Ai.Toolkit.make(searchTool),
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
              params: { query: "turn policy" },
              providerExecuted: false,
            }),
          )
        : Stream.make(
            Ai.Response.makePart("text-delta", { id: "assistant", delta: "TurnPolicy caps follow-up turns." }),
          )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  ToolExecutor.testLayer({
    execute: () =>
      Effect.succeed({
        _tag: "Success",
        result: "TurnPolicy is a plain value with a default of recurs(8).",
        encodedResult: "TurnPolicy is a plain value with a default of recurs(8).",
      }),
  }),
  Approvals.autoApprove,
  ModelMiddleware.identityLayer,
)

const describe = (event: AgentEvent.Event): string =>
  event._tag === "Completed" ? `Completed after ${event.turns} turns` : `turn ${event.turn} ${event._tag}`

const program = Agent.stream(agent, { prompt: "What does TurnPolicy do?" }).pipe(
  Stream.runForEach((event) => Console.log(describe(event))),
  Effect.provide(layers),
)

await Effect.runPromise(program)
