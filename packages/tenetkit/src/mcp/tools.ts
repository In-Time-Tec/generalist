import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { ToolExecutor } from "../core/index.js"
import { Context, type Duration, Effect, Layer, Schema, type Scope } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import {
  fromTransport,
  type Service,
  type JsonValue,
  MCPConnectionFailed,
  type MCPTool,
  type MCPToolFailure,
  MCPClient,
  type MCPTransport,
  layer,
} from "./client.js"
import type { OAuthPending, OAuthProviderError } from "./oauth.js"

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: MCPTransport | Transport
  readonly callTimeout?: Duration.Input
}

const MCPTransportSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("stdio"), command: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("http"), url: Schema.String }),
])

interface LayerOptions {
  name: string
  transport: MCPTransport
  callTimeout?: Duration.Input
}

/** @experimental */
export interface MCPTools {
  readonly toolkit: Toolkit.Toolkit<Record<string, MCPTool>>
  readonly executorLayer: Layer.Layer<ToolExecutor.ToolExecutor | Tool.Handler<string>>
}

/**
 * Discovered MCP tools as a TenetKit toolkit. Pair with {@link layerToolkit}
 * so tool calls are proxied to the MCP server through Effect AI handlers.
 *
 * @experimental
 */
export const toolkit = (client: Service): Effect.Effect<Toolkit.Toolkit<Record<string, MCPTool>>> =>
  client.aiTools.pipe(Effect.map((tools) => Toolkit.make(...tools)))

const toolFailure = (server: string, tool: string, message: string): MCPToolFailure => ({
  _tag: "tenetkit/mcp/MCPToolCallFailed",
  server,
  tool,
  message,
})

/**
 * Effect AI handler layer that proxies MCP tool calls to the MCP server.
 *
 * @experimental
 */
export const layerToolkit = (client: Service): Layer.Layer<Tool.Handler<string>> =>
  Layer.unwrap(
    Effect.gen(function* () {
      const mcpToolkit = yield* toolkit(client)
      const tools = yield* client.tools
      type HandlerInput = typeof Schema.Unknown.Type
      const handlers: Record<string, (params: HandlerInput) => Effect.Effect<JsonValue, MCPToolFailure>> = {}
      for (const tool of tools) {
        handlers[tool.name] = (params) =>
          Schema.decodeUnknownEffect(Schema.Json)(params).pipe(
            Effect.mapError((error) => toolFailure(client.server, tool.rawName, error.message)),
            Effect.flatMap((input) =>
              client
                .callTool(tool.rawName, input)
                .pipe(Effect.mapError((error) => toolFailure(error.server, error.tool, error.message))),
            ),
          )
      }
      return mcpToolkit.toLayer(handlers)
    }),
  )

const isMCPTransport = Schema.is(MCPTransportSchema)

const acquire = (
  options: Options,
): Effect.Effect<Service, MCPConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> =>
  !isMCPTransport(options.transport)
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
        return Layer.build(layer(layerOptions)).pipe(Effect.map((services) => Context.get(services, MCPClient)))
      })()

/**
 * Acquires one MCP connection and assembles its complete TenetKit tool integration.
 *
 * @experimental
 */
export const connect = (
  options: Options,
): Effect.Effect<MCPTools, MCPConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> =>
  Effect.gen(function* () {
    const client = yield* acquire(options)
    const mcpToolkit = yield* toolkit(client)
    const handlers = layerToolkit(client)
    return {
      toolkit: mcpToolkit,
      executorLayer: ToolExecutor.layerToolkit(mcpToolkit).pipe(Layer.provideMerge(handlers)),
    }
  })
