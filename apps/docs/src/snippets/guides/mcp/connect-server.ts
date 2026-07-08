import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry } from "@batonfx/core"
import { McpToolSource } from "@batonfx/mcp"
import * as BatonMcp from "@batonfx/mcp/baton"
import { OpenRouter } from "@batonfx/providers"

const sourceLayer = McpToolSource.layer({
  name: "files",
  transport: { kind: "stdio", command: "bunx", args: ["@modelcontextprotocol/server-filesystem", "."] },
  callTimeout: "30 seconds",
})

const program = Effect.gen(function* () {
  const source = yield* McpToolSource.McpToolSource
  const toolkit = yield* BatonMcp.toolkit(source)
  const agent = Agent.make({
    name: "file-agent",
    instructions: "Use the filesystem tools to answer.",
    toolkit,
  })
  const result = yield* ModelRegistry.provide(
    { provider: "openrouter", model: "openai/gpt-4o-mini" },
    Agent.generate(agent, { prompt: "List the markdown files in this project." }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(
        OpenRouter.withOpenRouter({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
        BatonMcp.toolExecutorLayer(source),
        Approvals.autoApprove,
        ModelMiddleware.identityLayer,
      ),
    ),
  )
  yield* Console.log(result.text)
}).pipe(Effect.provide(sourceLayer))

await Effect.runPromise(program)
