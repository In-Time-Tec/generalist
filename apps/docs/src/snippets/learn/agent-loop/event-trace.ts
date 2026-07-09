import { Console, Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, type AgentEvent, Approvals, ModelMiddleware } from "@batonfx/core"

const searchTool = Tool.make("search_docs", {
  description: "Search the project docs",
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(searchTool)

const agent = Agent.make({
  name: "docs-assistant",
  instructions: "Answer using the search results.",
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
              params: { query: "turn policy" },
              providerExecuted: false,
            }),
          )
        : Stream.make(Response.makePart("text-delta", { id: "assistant", delta: "TurnPolicy caps follow-up turns." }))
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ search_docs: () => Effect.succeed("TurnPolicy is a plain value with a default of recurs(8).") }),
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
