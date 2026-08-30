import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, type Duration, Effect, Function, Layer, type Scope } from "effect"
import { fromTransport, type Service, MCPConnectionFailed, MCPClient } from "../client.js"
import type { OAuthProviderError } from "../oauth.js"

/** @experimental Node/Bun-only stdio transport options. */
export interface TransportOptions {
  readonly command: string
  readonly args?: ReadonlyArray<string>
  readonly env?: Record<string, string>
}

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: TransportOptions
  readonly callTimeout?: Duration.Input
}

/** @experimental Construct a Node/Bun-only stdio MCP transport. */
export const make = (options: TransportOptions): Transport => {
  const parameters: StdioServerParameters = { command: options.command }
  if (options.args !== undefined) parameters.args = [...options.args]
  if (options.env !== undefined) parameters.env = options.env
  return new StdioClientTransport(parameters)
}

const makeInterface = (
  options: Options,
): Effect.Effect<Service, MCPConnectionFailed | OAuthProviderError, Scope.Scope> =>
  Effect.try({
    try: () => make(options.transport),
    catch: (error) => MCPConnectionFailed.make({ server: options.name, message: String(error) }),
  }).pipe(
    Effect.flatMap((transport) =>
      options.callTimeout === undefined
        ? fromTransport(options.name, transport)
        : fromTransport(options.name, transport, { callTimeout: options.callTimeout }),
    ),
  )

/** @experimental */
export const layer = (options: Options): Layer.Layer<MCPClient, MCPConnectionFailed | OAuthProviderError> =>
  Layer.effect(MCPClient, makeInterface(options))

/** @experimental */
export const layerTagged: {
  (
    options: Options,
  ): <Identifier>(
    tag: Context.Key<Identifier, Service>,
  ) => Layer.Layer<Identifier, MCPConnectionFailed | OAuthProviderError>
  <Identifier>(
    tag: Context.Key<Identifier, Service>,
    options: Options,
  ): Layer.Layer<Identifier, MCPConnectionFailed | OAuthProviderError>
} = Function.dual(2, <Identifier>(tag: Context.Key<Identifier, Service>, options: Options) =>
  Layer.effect(tag, makeInterface(options)),
)
