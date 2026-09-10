import { BunRuntime } from "@effect/platform-bun"
import { Config, Console, Effect, Layer } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { MCPClient } from "generalist/unstable/mcp"
import { layer as httpClient } from "generalist/unstable/mcp/client/http"
import { layerToolkit, toolkit } from "generalist/unstable/mcp/tools"
import { layer, text, toolCall } from "generalist/testing/model"

const program = Effect.gen(function* () {
  const client = yield* MCPClient.MCPClient
  const repositoryTools = yield* toolkit(client)
  const coder = Agent.make({ name: "coding-agent", toolkit: repositoryTools })
  const services = Layer.mergeAll(
    layerToolkit(client),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
    layer([
      toolCall("repository_read_file", { path: "src/average.ts" }),
      text("The MCP source confirms that empty input divides by zero."),
    ]),
  )
  const answer = yield* Agent.run(coder, "Inspect average([]) through the repository server.").pipe(
    Effect.provide(services),
  )
  yield* Console.log(answer)
})

const connection = Layer.unwrap(
  Config.String("MCP_URL").pipe(
    Config.withDefault("http://127.0.0.1:4323/mcp"),
    Effect.map((url) => httpClient({ name: "repository", transport: { url } })),
  ),
)

BunRuntime.runMain(program.pipe(Effect.provide(connection)))
