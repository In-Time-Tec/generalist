import { Effect, Layer } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import type { Interface, JsonValue } from "./mcp-tool-source.js"

/**
 * Discovered MCP tools as a Baton toolkit. Pair with {@link toolkitLayer}
 * so tool calls are proxied to the MCP server through Effect AI handlers.
 *
 * @experimental
 */
export const toolkit = (source: Interface): Effect.Effect<Toolkit.Toolkit<Record<string, Tool.Any>>> =>
  source.aiTools.pipe(Effect.map((tools) => Toolkit.make(...tools) as Toolkit.Toolkit<Record<string, Tool.Any>>))

/**
 * Effect AI handler layer that proxies MCP tool calls to the MCP server.
 *
 * @experimental
 */
export const toolkitLayer = (source: Interface): Layer.Layer<Tool.Handler<any>> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const mcpToolkit = yield* toolkit(source)
      const tools = yield* source.tools
      const handlers = Object.fromEntries(
        tools.map((tool) => [
          tool.name,
          (params: unknown) =>
            source
              .callTool(tool.rawName, params as JsonValue)
              .pipe(Effect.catchTag("McpToolCallError", (error) => Effect.fail(error.message))),
        ]),
      ) as Toolkit.HandlersFrom<typeof mcpToolkit.tools>
      return mcpToolkit.toLayer(handlers)
    }),
  )
