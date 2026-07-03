import { Console, Effect, Layer, Schema, Stream } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware } from "@batonfx/core"
import { McpToolSource } from "@batonfx/mcp"
import * as BatonMcp from "@batonfx/mcp/baton"

type ModelParams = Parameters<typeof Ai.LanguageModel.make>[0]

const source: McpToolSource.Interface = {
  server: "local",
  tools: Effect.succeed([
    {
      name: "local_search",
      rawName: "search",
      description: "Search local docs",
      inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      outputSchema: {},
    },
  ]),
  callTool: (_rawName, input) => Effect.succeed({ ok: true, input }),
  aiTools: Effect.succeed([
    Ai.Tool.dynamic("local_search", {
      description: "Search local docs",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
      success: Schema.Unknown,
    }),
  ]),
}

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<Ai.LanguageModel.LanguageModel> =>
  Layer.effect(
    Ai.LanguageModel.LanguageModel,
    Ai.LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

let calls = 0

const program = Effect.gen(function* () {
  const toolkit = yield* BatonMcp.toolkit(source)
  const agent = Agent.make({ name: "mcp-agent", toolkit })
  const result = yield* Agent.generate(agent, { prompt: "Find the setup docs" }).pipe(
    Effect.provide(
      Layer.mergeAll(
        modelLayer(() => {
          calls += 1
          return calls === 1
            ? Stream.make(
                Ai.Response.makePart("tool-call", {
                  id: "search-1",
                  name: "local_search",
                  params: { query: "setup" },
                  providerExecuted: false,
                }),
              )
            : Stream.make(Ai.Response.makePart("text-delta", { id: "assistant", delta: "Found local setup docs." }))
        }),
        BatonMcp.toolExecutorLayer(source),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
    ),
  )
  yield* Console.log(result.text)
})

await Effect.runPromise(program)
