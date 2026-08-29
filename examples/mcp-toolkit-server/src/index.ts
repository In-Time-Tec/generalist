import { layer as layerBunHttp } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Config, Effect, Layer, Schema } from "effect"
import { McpProtocol, McpServer } from "effect/unstable/ai"
import { HttpRouter } from "effect/unstable/http"
import { Tool, Toolkit } from "tenetkit"

const greeting = Tool.make("greeting", {
  description: "Create a greeting for a person",
  parameters: Schema.Struct({ name: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(greeting)

const handlers = toolkit.toLayer({
  greeting: ({ name }) => Effect.succeed(`Hello, ${name}!`),
})

const mcpLayer = McpServer.toolkit(toolkit).pipe(
  Layer.provideMerge(handlers),
  Layer.provide(
    McpServer.layerHttp({
      name: "tenetkit-toolkit-example",
      version: "1.0.0",
      path: "/mcp",
      protocols: [McpProtocol.v2025_06_18],
    }),
  ),
)

const serverLayer = (port: number) => HttpRouter.serve(mcpLayer).pipe(Layer.provideMerge(layerBunHttp({ port })))

const main = Effect.gen(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(4001))
  yield* Effect.log(`legacy MCP 2025-06-18 server listening on port ${port}`)
  return yield* Layer.launch(serverLayer(port))
})

if (import.meta.main) {
  runMain(main)
}
