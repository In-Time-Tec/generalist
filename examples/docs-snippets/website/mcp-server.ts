import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { Config, Effect, Layer, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/unstable/ai"
import { HttpRouter } from "effect/unstable/http"

const readFile = Tool.make("read_file", {
  description: "Read the coding exercise's fixture source.",
  parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]) }),
  success: Schema.String,
})
const toolkit = Toolkit.make(readFile)
const handlers = toolkit.toLayer({
  read_file: () => Effect.succeed("export const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length"),
})

const main = Effect.gen(function* () {
  const port = yield* Config.Port("PORT").pipe(Config.withDefault(4323))
  const tools = McpServer.toolkit(toolkit).pipe(
    Layer.provideMerge(handlers),
    Layer.provide(
      McpServer.layerHttp({
        name: "coding-repository",
        version: "1.0.0",
        path: "/mcp",
        protocols: [McpProtocol.v2025_06_18],
      }),
    ),
  )
  return yield* Layer.launch(
    HttpRouter.serve(tools).pipe(Layer.provide(BunHttpServer.layer({ hostname: "127.0.0.1", port }))),
  )
})

BunRuntime.runMain(main)
