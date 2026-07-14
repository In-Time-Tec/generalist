import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ToolExecutor } from "@batonfx/core"
import { Context, type Duration, Effect, Layer, Schema, type Scope } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import {
  fromTransport,
  type Interface,
  type JsonValue,
  McpConnectionError,
  type McpAiTool,
  type McpToolFailure,
  McpToolSource,
  type McpTransport,
  layer,
} from "./mcp-tool-source.js"
import type { OAuthPendingError, OAuthProviderError } from "./oauth.js"

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: McpTransport | Transport
  readonly callTimeout?: Duration.Input
}

/** @experimental */
export interface BatonTools {
  readonly toolkit: Toolkit.Toolkit<Record<string, McpAiTool>>
  readonly executorLayer: Layer.Layer<ToolExecutor.ToolExecutor | Tool.Handler<string>>
}

/**
 * Discovered MCP tools as a Baton toolkit. Pair with {@link toolkitLayer}
 * so tool calls are proxied to the MCP server through Effect AI handlers.
 *
 * @experimental
 */
export const toolkit = (source: Interface): Effect.Effect<Toolkit.Toolkit<Record<string, McpAiTool>>> =>
  source.aiTools.pipe(Effect.map((tools) => Toolkit.make(...tools) as Toolkit.Toolkit<Record<string, McpAiTool>>))

const toolFailure = (server: string, tool: string, message: string): McpToolFailure => ({
  _tag: "McpToolCallError",
  server,
  tool,
  message,
})

/**
 * Effect AI handler layer that proxies MCP tool calls to the MCP server.
 *
 * @experimental
 */
export const toolkitLayer = (source: Interface): Layer.Layer<Tool.Handler<string>> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const mcpToolkit = yield* toolkit(source)
      const tools = yield* source.tools
      const handlers = Object.fromEntries(
        tools.map((tool) => [
          tool.name,
          (params: unknown): Effect.Effect<JsonValue, McpToolFailure> =>
            Schema.decodeUnknownEffect(Schema.Json)(params).pipe(
              Effect.mapError((error) => toolFailure(source.server, tool.rawName, error.message)),
              Effect.flatMap((input) =>
                source
                  .callTool(tool.rawName, input)
                  .pipe(Effect.mapError((error) => toolFailure(error.server, error.tool, error.message))),
              ),
            ),
        ]),
      ) as Toolkit.HandlersFrom<typeof mcpToolkit.tools>
      return mcpToolkit.toLayer(handlers)
    }),
  )

const isTransport = (transport: McpTransport | Transport): transport is Transport =>
  "start" in transport &&
  typeof transport.start === "function" &&
  "send" in transport &&
  typeof transport.send === "function" &&
  "close" in transport &&
  typeof transport.close === "function"

const acquire = (
  options: Options,
): Effect.Effect<Interface, McpConnectionError | OAuthPendingError | OAuthProviderError, Scope.Scope> =>
  isTransport(options.transport)
    ? fromTransport(
        options.name,
        options.transport,
        options.callTimeout === undefined ? undefined : { callTimeout: options.callTimeout },
      )
    : Layer.build(
        layer({
          name: options.name,
          transport: options.transport,
          ...(options.callTimeout === undefined ? {} : { callTimeout: options.callTimeout }),
        }),
      ).pipe(Effect.map((services) => Context.get(services, McpToolSource)))

/**
 * Acquires one MCP connection and assembles its complete Baton tool integration.
 *
 * @experimental
 */
export const route = (
  options: Options,
): Effect.Effect<BatonTools, McpConnectionError | OAuthPendingError | OAuthProviderError, Scope.Scope> =>
  Effect.gen(function* () {
    const source = yield* acquire(options)
    const mcpToolkit = yield* toolkit(source)
    const handlers = toolkitLayer(source)
    return {
      toolkit: mcpToolkit,
      executorLayer: ToolExecutor.fromToolkit(mcpToolkit).pipe(Layer.provideMerge(handlers)),
    }
  })
