import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions } from "generalist"
import { connect } from "generalist/mcp/tools"
import { make as makeStdioTransport } from "generalist/mcp/client/stdio"
import { layer as openRouterLayer } from "generalist/ai/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const program = Effect.gen(function* () {
  const tools = yield* connect({
    name: "files",
    transport: makeStdioTransport({
      command: "bunx",
      args: ["@modelcontextprotocol/server-filesystem", "."],
    }),
    callTimeout: "30 seconds",
  })
  const agent = Agent.make({
    name: "file-agent",
    instructions: "Use the filesystem tools to answer.",
    toolkit: tools.toolkit,
  })
  const result = yield* Effect.scoped(
    Effect.flatMap(
      Layer.build(
        Layer.mergeAll(
          openRouterLayer({
            model: "openai/gpt-4o-mini",
            apiKey: Config.redacted("OPENROUTER_API_KEY"),
          }),
          tools.executorLayer,
          Permissions.layerAllowAll,
          Approvals.layerAutoApprove,
          ModelMiddleware.layerIdentity,
        ),
      ),
      (services) =>
        ModelRegistry.withModel(
          { provider: "openrouter", model: "openai/gpt-4o-mini" },
          Agent.generate(agent, { prompt: "List the markdown files in this project." }),
        ).pipe(Effect.provideContext(services)),
    ),
  )
  yield* Console.log(result.text)
}).pipe(Effect.scoped)

const runtime = ManagedRuntime.make(FetchHttpClient.layer)
await runtime.runPromise(program)
