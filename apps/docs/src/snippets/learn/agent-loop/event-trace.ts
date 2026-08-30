import { Console, Effect, Layer, ManagedRuntime, Schema, Stream } from "effect"
import { Agent, Approvals, LanguageModel, ModelMiddleware, Response, Tool, Toolkit, type AgentEvent } from "tenetkit"

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

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

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
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Policy caps follow-up turns." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const layers = Layer.mergeAll(
  modelLayer,
  toolkit.toLayer({ search_docs: () => Effect.succeed("Policy is a plain value with a default of forever.") }),
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const describe = (event: AgentEvent.Event): string =>
  event._tag === "Completed" ? `Completed after ${event.turns} turns` : `turn ${event.turn} ${event._tag}`

const program = Agent.stream(agent, { prompt: "What does Policy do?" }).pipe(
  Stream.filter((event) => event._tag !== "ModelPart"),
  Stream.runForEach((event) => Console.log(describe(event))),
)

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
