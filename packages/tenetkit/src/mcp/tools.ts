import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ToolExecutor } from "../core/index.js"
import { Context, type Duration, Effect, Layer, Schema, type Scope } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import {
  fromTransport,
  type Interface,
  type JsonValue,
  McpConnectionFailed,
  type McpAiTool,
  type McpToolFailure,
  McpToolSource,
  type McpTransport,
  layer,
} from "./tool-source.js"
import type { OAuthPending, OAuthProviderError } from "./oauth.js"

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: McpTransport | Transport
  readonly callTimeout?: Duration.Input
}

const McpTransportSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("stdio"), command: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("http"), url: Schema.String }),
])

interface LayerOptions {
  name: string
  transport: McpTransport
  callTimeout?: Duration.Input
}

/** @experimental */
export interface McpTools {
  readonly toolkit: Toolkit.Toolkit<Record<string, McpAiTool>>
  readonly executorLayer: Layer.Layer<ToolExecutor.ToolExecutor | Tool.Handler<string>>
}

/**
 * Discovered MCP tools as a TenetKit toolkit. Pair with {@link layerToolkit}
 * so tool calls are proxied to the MCP server through Effect AI handlers.
 *
 * @experimental
 */
export const toolkit = (source: Interface): Effect.Effect<Toolkit.Toolkit<Record<string, McpAiTool>>> =>
  source.aiTools.pipe(Effect.map((tools) => Toolkit.make(...tools)))

const toolFailure = (server: string, tool: string, message: string): McpToolFailure => ({
  _tag: "tenetkit/mcp/McpToolCallFailed",
  server,
  tool,
  message,
})

/**
 * Effect AI handler layer that proxies MCP tool calls to the MCP server.
 *
 * @experimental
 */
export const layerToolkit = (source: Interface): Layer.Layer<Tool.Handler<string>> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const mcpToolkit = yield* toolkit(source)
      const tools = yield* source.tools
      type HandlerInput = typeof Schema.Unknown.Type
      const handlers: Record<string, (params: HandlerInput) => Effect.Effect<JsonValue, McpToolFailure>> = {}
      for (const tool of tools) {
        handlers[tool.name] = (params) =>
          Schema.decodeUnknownEffect(Schema.Json)(params).pipe(
            Effect.mapError((error) => toolFailure(source.server, tool.rawName, error.message)),
            Effect.flatMap((input) =>
              source
                .callTool(tool.rawName, input)
                .pipe(Effect.mapError((error) => toolFailure(error.server, error.tool, error.message))),
            ),
          )
      }
      return mcpToolkit.toLayer(handlers)
    }),
  )

const isMcpTransport = Schema.is(McpTransportSchema)

const acquire = (
  options: Options,
): Effect.Effect<Interface, McpConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> =>
  !isMcpTransport(options.transport)
    ? fromTransport(
        options.name,
        options.transport,
        options.callTimeout === undefined ? undefined : { callTimeout: options.callTimeout },
      )
    : (() => {
        const layerOptions: LayerOptions = {
          name: options.name,
          transport: options.transport,
        }
        if (options.callTimeout !== undefined) layerOptions.callTimeout = options.callTimeout
        return Layer.build(layer(layerOptions)).pipe(Effect.map((services) => Context.get(services, McpToolSource)))
      })()

/**
 * Acquires one MCP connection and assembles its complete TenetKit tool integration.
 *
 * @experimental
 */
export const route = (
  options: Options,
): Effect.Effect<McpTools, McpConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> =>
  Effect.gen(function* () {
    const source = yield* acquire(options)
    const mcpToolkit = yield* toolkit(source)
    const handlers = layerToolkit(source)
    return {
      toolkit: mcpToolkit,
      executorLayer: ToolExecutor.layerToolkit(mcpToolkit).pipe(Layer.provideMerge(handlers)),
    }
  })
