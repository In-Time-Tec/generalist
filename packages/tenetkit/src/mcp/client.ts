import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport, type StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js"
import {
  StreamableHTTPClientTransport,
  type StreamableHTTPClientTransportOptions,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Duration, Effect, Function, Layer, Option, Ref, Schema, Scope } from "effect"
import type { JsonSchema } from "effect/JsonSchema"
import { Tool } from "effect/unstable/ai"
import { OAuthPending, OAuthProviderError } from "./oauth.js"
/** @experimental */
export type JsonValue = Schema.Json

/** @experimental */
export type MCPTransport =
  | {
      readonly kind: "stdio"
      readonly command: string
      readonly args?: ReadonlyArray<string>
      readonly env?: Record<string, string>
    }
  | {
      readonly kind: "http"
      readonly url: string
      readonly headers?: Record<string, string>
      readonly oauth?: import("./oauth.js").Service
    }

/** @experimental */
export interface CallOptions {
  readonly callTimeout?: Duration.Input
}

/** @experimental */
export class MCPConnectionFailed extends Schema.TaggedError<MCPConnectionFailed>()("tenetkit/mcp/MCPConnectionFailed", {
  server: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export class MCPToolCallFailed extends Schema.TaggedError<MCPToolCallFailed>()("tenetkit/mcp/MCPToolCallFailed", {
  server: Schema.String,
  tool: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export const MCPToolFailure = Schema.Struct(MCPToolCallFailed.fields)

/** @experimental */
export type MCPToolFailure = typeof MCPToolFailure.Type

/** @experimental */
export type MCPTool = Tool.Dynamic<
  string,
  {
    readonly parameters: JsonSchema
    readonly success: typeof Schema.Unknown
    readonly failure: typeof Schema.String | typeof MCPToolFailure
    readonly failureMode: "return"
  }
>

/** @experimental */
export interface DiscoveredTool {
  readonly name: string
  readonly rawName: string
  readonly description: string
  readonly inputSchema: JsonValue
  readonly outputSchema: JsonValue
}

/** @experimental */
export interface Service {
  readonly server: string
  readonly tools: Effect.Effect<ReadonlyArray<DiscoveredTool>>
  readonly callTool: (rawName: string, input: JsonValue) => Effect.Effect<JsonValue, MCPToolCallFailed>
  readonly aiTools: Effect.Effect<ReadonlyArray<MCPTool>>
}

/** @experimental */
export class MCPClient extends Context.Service<MCPClient, Service>()("tenetkit/mcp/client/MCPClient") {}

const errorDetails = Schema.Struct({ name: Schema.String, message: Schema.String })

const formatErrorDetails = (details: Option.Option<typeof errorDetails.Type>, fallback: string): string =>
  Option.isSome(details) ? `${details.value.name}: ${details.value.message}` : fallback

const sanitizedConnectionError = (server: string): MCPConnectionFailed =>
  MCPConnectionFailed.make({ server, message: "MCP connection failed" })

const textContent = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })
const Content = Schema.Array(Schema.Unknown)
type ContentInput = typeof Schema.Unknown.Type

const joinedText = (content: ContentInput): string => {
  const decodedContent = Schema.decodeUnknownOption(Content)(content)
  if (Option.isNone(decodedContent)) return ""
  return decodedContent.value
    .flatMap((part) => {
      const decoded = Schema.decodeUnknownOption(textContent)(part)
      return Option.isSome(decoded) ? [decoded.value.text] : []
    })
    .join("\n")
}

interface CallRequestOptions {
  signal: AbortSignal
  timeout?: number
}

const discoveredTool = (
  server: string,
  tool: { name: string; description?: string | undefined; inputSchema: unknown; outputSchema?: unknown },
): Effect.Effect<DiscoveredTool, MCPConnectionFailed> =>
  Effect.all({
    inputSchema: Schema.decodeUnknownEffect(Schema.Json)(tool.inputSchema),
    outputSchema:
      tool.outputSchema === undefined
        ? Effect.succeed<JsonValue>({})
        : Schema.decodeUnknownEffect(Schema.Json)(tool.outputSchema),
  }).pipe(
    Effect.mapError((error) => MCPConnectionFailed.make({ server, message: error.message })),
    Effect.map(({ inputSchema, outputSchema }) => ({
      name: `${server}_${tool.name}`,
      rawName: tool.name,
      description: tool.description ?? "",
      inputSchema,
      outputSchema,
    })),
  )

const jsonObject = Schema.Record(Schema.String, Schema.Json)

const callArguments = (input: JsonValue): Record<string, JsonValue> | undefined => {
  const decoded = Schema.decodeUnknownOption(jsonObject)(input)
  return Option.isSome(decoded) ? decoded.value : undefined
}

const asJsonSchema = (value: JsonValue): JsonSchema => {
  const decoded = Schema.decodeUnknownOption(jsonObject)(value)
  return Option.isSome(decoded) ? decoded.value : {}
}

const aiToolFromDiscovered = (tool: DiscoveredTool): MCPTool =>
  Tool.dynamic(tool.name, {
    description: tool.description,
    parameters: asJsonSchema(tool.inputSchema),
    success: Schema.Unknown,
    failure: MCPToolFailure,
    failureMode: "return",
  })

/** @experimental */
export const fromTransport: {
  (
    transport: Transport,
    options?: CallOptions,
  ): (name: string) => Effect.Effect<Service, MCPConnectionFailed | OAuthProviderError, Scope.Scope>
  (
    name: string,
    transport: Transport,
    options?: CallOptions,
  ): Effect.Effect<Service, MCPConnectionFailed | OAuthProviderError, Scope.Scope>
} = Function.dual(
  (args) => Schema.is(Schema.String)(args[0]),
  (name: string, transport: Transport, options?: CallOptions) =>
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const connectedClient = new Client({ name: `tenetkit/mcp:${name}`, version: "0.0.0" })
          yield* Effect.tryPromise({
            try: () => connectedClient.connect(transport),
            catch: (error) =>
              Schema.is(OAuthProviderError)(error)
                ? error
                : MCPConnectionFailed.make({
                    server: name,
                    message: formatErrorDetails(Schema.decodeUnknownOption(errorDetails)(error), String(error)),
                  }),
          }).pipe(Effect.tapError(() => Effect.tryPromise(() => connectedClient.close()).pipe(Effect.ignore)))
          return connectedClient
        }),
        (connected) => Effect.tryPromise(() => connected.close()).pipe(Effect.ignore),
      )

      const listed = yield* Effect.tryPromise({
        try: () => client.listTools(),
        catch: (error) =>
          Schema.is(OAuthProviderError)(error)
            ? error
            : MCPConnectionFailed.make({
                server: name,
                message: formatErrorDetails(Schema.decodeUnknownOption(errorDetails)(error), String(error)),
              }),
      })
      const discoveredTools = yield* Effect.forEach(listed.tools, (tool) => discoveredTool(name, tool), {
        concurrency: 1,
      })
      const discovered = yield* Ref.make<ReadonlyArray<DiscoveredTool>>(discoveredTools)

      const callTimeoutMillis = options?.callTimeout === undefined ? undefined : Duration.toMillis(options.callTimeout)

      const callTool = (rawName: string, input: JsonValue): Effect.Effect<JsonValue, MCPToolCallFailed> =>
        Effect.tryPromise({
          try: (signal) => {
            const requestOptions: CallRequestOptions = { signal }
            if (callTimeoutMillis !== undefined) requestOptions.timeout = callTimeoutMillis
            return client.callTool({ name: rawName, arguments: callArguments(input) }, undefined, requestOptions)
          },
          catch: (error) =>
            MCPToolCallFailed.make({
              server: name,
              tool: rawName,
              message: formatErrorDetails(Schema.decodeUnknownOption(errorDetails)(error), String(error)),
            }),
        }).pipe(
          Effect.flatMap((result) => {
            if (result.isError === true) {
              const message = joinedText(result.content)
              return Effect.fail(
                MCPToolCallFailed.make({
                  server: name,
                  tool: rawName,
                  message: message === "" ? "Tool call failed" : message,
                }),
              )
            }
            if (result.structuredContent !== undefined) {
              return Schema.decodeUnknownEffect(Schema.Json)(result.structuredContent).pipe(
                Effect.mapError((error) =>
                  MCPToolCallFailed.make({ server: name, tool: rawName, message: error.message }),
                ),
              )
            }
            return Effect.succeed<JsonValue>(joinedText(result.content))
          }),
        )

      return MCPClient.of({
        server: name,
        tools: Ref.get(discovered),
        callTool,
        aiTools: Ref.get(discovered).pipe(Effect.map((tools) => tools.map(aiToolFromDiscovered))),
      })
    }),
)

const adaptHttpTransport = (http: StreamableHTTPClientTransport): Transport => {
  const adapted: Transport = {
    start: () =>
      http.start().then(() => {
        if (http.sessionId !== undefined) adapted.sessionId = http.sessionId
        return undefined
      }),
    send: (message, options) => {
      if (options === undefined) return http.send(message)
      if (options.resumptionToken === undefined) {
        return options.onresumptiontoken === undefined
          ? http.send(message)
          : http.send(message, { onresumptiontoken: options.onresumptiontoken })
      }
      return options.onresumptiontoken === undefined
        ? http.send(message, { resumptionToken: options.resumptionToken })
        : http.send(message, {
            resumptionToken: options.resumptionToken,
            onresumptiontoken: options.onresumptiontoken,
          })
    },
    close: () => http.close(),
    setProtocolVersion: (version) => http.setProtocolVersion(version),
  }
  Object.assign(http, {
    onclose: () => adapted.onclose?.(),
    onerror: (error: Error) => adapted.onerror?.(error),
    onmessage: (message: Parameters<NonNullable<Transport["onmessage"]>>[0]) => adapted.onmessage?.(message),
  })
  return adapted
}

const buildTransport = (server: string, transport: MCPTransport): Effect.Effect<Transport, MCPConnectionFailed> =>
  Effect.try({
    try: (): Transport => {
      if (transport.kind === "stdio") {
        const options: StdioServerParameters = {
          command: transport.command,
        }
        if (transport.args !== undefined) options.args = [...transport.args]
        if (transport.env !== undefined) options.env = transport.env
        return new StdioClientTransport(options)
      }
      const options: StreamableHTTPClientTransportOptions = {}
      if (transport.headers !== undefined) options.requestInit = { headers: transport.headers }
      if (transport.oauth !== undefined) options.authProvider = transport.oauth.provider
      return adaptHttpTransport(new StreamableHTTPClientTransport(new URL(transport.url), options))
    },
    catch: (error) =>
      MCPConnectionFailed.make({
        server,
        message: formatErrorDetails(Schema.decodeUnknownOption(errorDetails)(error), String(error)),
      }),
  })

const makeService = (options: {
  readonly name: string
  readonly transport: MCPTransport
  readonly callTimeout?: Duration.Input
}): Effect.Effect<Service, MCPConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> => {
  const connect = buildTransport(options.name, options.transport).pipe(
    Effect.flatMap((transport) => {
      if (options.callTimeout === undefined) return fromTransport(options.name, transport)
      return fromTransport(options.name, transport, { callTimeout: options.callTimeout })
    }),
  )
  const oauth = options.transport.kind === "http" ? options.transport.oauth : undefined
  if (oauth === undefined) return connect
  return oauth.withTransport(
    Effect.gen(function* () {
      const before = yield* oauth.pending
      return yield* connect.pipe(
        Effect.catchTag("tenetkit/mcp/MCPConnectionFailed", () =>
          oauth.pending.pipe(
            Effect.flatMap((current): Effect.Effect<never, MCPConnectionFailed | OAuthPending> => {
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
export const layer = (options: {
  readonly name: string
  readonly transport: MCPTransport
  readonly callTimeout?: Duration.Input
}): Layer.Layer<MCPClient, MCPConnectionFailed | OAuthPending | OAuthProviderError> =>
  Layer.effect(MCPClient, makeService(options))

/** @experimental */
export const layerTagged: {
  (options: {
    readonly name: string
    readonly transport: MCPTransport
    readonly callTimeout?: Duration.Input
  }): <Identifier>(
    tag: Context.Key<Identifier, Service>,
  ) => Layer.Layer<Identifier, MCPConnectionFailed | OAuthPending | OAuthProviderError>
  <Identifier>(
    tag: Context.Key<Identifier, Service>,
    options: {
      readonly name: string
      readonly transport: MCPTransport
      readonly callTimeout?: Duration.Input
    },
  ): Layer.Layer<Identifier, MCPConnectionFailed | OAuthPending | OAuthProviderError>
} = Function.dual(
  2,
  <Identifier>(
    tag: Context.Key<Identifier, Service>,
    options: {
      readonly name: string
      readonly transport: MCPTransport
      readonly callTimeout?: Duration.Input
    },
  ) => Layer.effect(tag, makeService(options)),
)
