import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry } from "@batonfx/core"
import { route } from "@batonfx/mcp/baton"
import { OpenRouter } from "@batonfx/providers"
import { FetchHttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const tools = yield* route({
    name: "files",
    transport: { kind: "stdio", command: "bunx", args: ["@modelcontextprotocol/server-filesystem", "."] },
    callTimeout: "30 seconds",
  })
  const agent = Agent.make({
    name: "file-agent",
    instructions: "Use the filesystem tools to answer.",
    toolkit: tools.toolkit,
  })
  const result = yield* ModelRegistry.operate(
    { provider: "openrouter", model: "openai/gpt-4o-mini" },
    Agent.generate(agent, { prompt: "List the markdown files in this project." }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(
        OpenRouter.layer({
          model: "openai/gpt-4o-mini",
          apiKey: Config.redacted("OPENROUTER_API_KEY"),
        }),
        tools.executorLayer,
        Approvals.layerAutoApprove,
        ModelMiddleware.layerIdentity,
      ),
    ),
  )
  yield* Console.log(result.text)
}).pipe(Effect.scoped, Effect.provide(FetchHttpClient.layer))

await Effect.runPromise(program)
