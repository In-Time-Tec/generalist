import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, type Duration, Effect, Function, Layer, Option, type Scope } from "effect"
import { OAuthPending, type Interface as OAuthInterface, OAuthProviderError } from "../oauth.js"
import { fromTransport, type Interface, McpConnectionFailed, McpToolSource } from "../tool-source.js"

/** @experimental Process-local HTTP transport options. Construct request headers at this boundary. */
export interface TransportOptions {
  readonly url: string
  readonly requestInit?: StreamableHTTPClientTransportOptions["requestInit"]
  readonly oauth?: OAuthInterface
}

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: TransportOptions
  readonly callTimeout?: Duration.Input
}

/** @experimental Construct a Worker-safe Streamable HTTP MCP transport. */
export const make = (options: TransportOptions): Transport => {
  const transportOptions: StreamableHTTPClientTransportOptions = {}
  if (options.requestInit !== undefined) transportOptions.requestInit = options.requestInit
  if (options.oauth !== undefined) transportOptions.authProvider = options.oauth.provider
  const http = new StreamableHTTPClientTransport(new URL(options.url), transportOptions)
  const transport: Transport = {
    start: () => http.start(),
    send: (message, sendOptions) => http.send(message, sendOptions),
    close: () => http.close(),
    setProtocolVersion: (version) => http.setProtocolVersion(version),
  }
  Object.assign(http, {
    onclose: () => transport.onclose?.(),
    onerror: (error: Error) => transport.onerror?.(error),
    onmessage: (message: Parameters<NonNullable<Transport["onmessage"]>>[0]) => transport.onmessage?.(message),
  })
  Object.defineProperty(transport, "sessionId", { get: () => http.sessionId })
  return transport
}

const sanitizedConnectionError = (server: string): McpConnectionFailed =>
  McpConnectionFailed.make({ server, message: "MCP connection failed" })

const makeInterface = (
  options: Options,
): Effect.Effect<Interface, McpConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> => {
  const connect = Effect.try({
    try: () => make(options.transport),
    catch: (error) => McpConnectionFailed.make({ server: options.name, message: String(error) }),
  }).pipe(
    Effect.flatMap((transport) =>
      options.callTimeout === undefined
        ? fromTransport(options.name, transport)
        : fromTransport(options.name, transport, { callTimeout: options.callTimeout }),
    ),
  )
  const oauth = options.transport.oauth
  if (oauth === undefined) return connect
  return oauth.withTransport(
    Effect.gen(function* () {
      const before = yield* oauth.pending
      return yield* connect.pipe(
        Effect.catchTag("tenetkit/mcp/McpConnectionFailed", () =>
          oauth.pending.pipe(
            Effect.flatMap((current): Effect.Effect<never, McpConnectionFailed | OAuthPending> => {
              if (Option.isNone(current)) return Effect.fail(sanitizedConnectionError(options.name))
              if (Option.isSome(before) && before.value.url === current.value.url) {
                return Effect.fail(sanitizedConnectionError(options.name))
              }
              return Effect.fail(OAuthPending.make({ authorizationUrl: current.value.url }))
            }),
          ),
        ),
      )
    }),
  )
}

/** @experimental */
export const layer = (
  options: Options,
): Layer.Layer<McpToolSource, McpConnectionFailed | OAuthPending | OAuthProviderError> =>
  Layer.effect(McpToolSource, makeInterface(options))

/** @experimental */
export const layerTagged: {
  (
    options: Options,
  ): <Identifier>(
    tag: Context.Key<Identifier, Interface>,
  ) => Layer.Layer<Identifier, McpConnectionFailed | OAuthPending | OAuthProviderError>
  <Identifier>(
    tag: Context.Key<Identifier, Interface>,
    options: Options,
  ): Layer.Layer<Identifier, McpConnectionFailed | OAuthPending | OAuthProviderError>
} = Function.dual(2, <Identifier>(tag: Context.Key<Identifier, Interface>, options: Options) =>
  Layer.effect(tag, makeInterface(options)),
)
