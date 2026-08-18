import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Duration, Effect, Function, Layer, Option, Ref, Schema, Scope } from "effect"
import type { JsonSchema } from "effect/JsonSchema"
import { Tool } from "effect/unstable/ai"
import { OAuthPending, OAuthProviderError } from "./oauth.js"
/** @experimental */
export type JsonValue = Schema.Json

/** @experimental */
export type McpTransport =
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
      readonly oauth?: import("./oauth.js").Interface
    }

/** @experimental */
export interface CallOptions {
  readonly callTimeout?: Duration.Input
}

/** @experimental */
export class McpConnectionFailed extends Schema.TaggedErrorClass<McpConnectionFailed>()(
  "tenetkit/mcp/McpConnectionFailed",
  {
    server: Schema.String,
    message: Schema.String,
  },
) {}

/** @experimental */
export class McpToolCallFailed extends Schema.TaggedErrorClass<McpToolCallFailed>()("tenetkit/mcp/McpToolCallFailed", {
  server: Schema.String,
  tool: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export const McpToolFailure = Schema.Struct(McpToolCallFailed.fields)

/** @experimental */
export type McpToolFailure = typeof McpToolFailure.Type

/** @experimental */
export type McpAiTool = Tool.Dynamic<
  string,
  {
    readonly parameters: JsonSchema
    readonly success: typeof Schema.Unknown
    readonly failure: typeof Schema.String | typeof McpToolFailure
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
export interface Interface {
  readonly server: string
  readonly tools: Effect.Effect<ReadonlyArray<DiscoveredTool>>
  readonly callTool: (rawName: string, input: JsonValue) => Effect.Effect<JsonValue, McpToolCallFailed>
  readonly aiTools: Effect.Effect<ReadonlyArray<McpAiTool>>
}

/** @experimental */
export class McpToolSource extends Context.Service<McpToolSource, Interface>()(
  "tenetkit/mcp/mcp/mcp-tool-source/McpToolSource",
) {}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const connectionError = (server: string, error: unknown): McpConnectionFailed | OAuthProviderError =>
  Schema.is(OAuthProviderError)(error) ? error : McpConnectionFailed.make({ server, message: errorMessage(error) })

const sanitizedConnectionError = (server: string): McpConnectionFailed =>
  McpConnectionFailed.make({ server, message: "MCP connection failed" })

const textContent = Schema.Struct({ type: Schema.Literal("text"), text: Schema.String })

const joinedText = (content: unknown): string => {
  if (!Array.isArray(content)) return ""
  return content
    .flatMap((part) => {
      const decoded = Schema.decodeUnknownOption(textContent)(part)
      return Option.isSome(decoded) ? [decoded.value.text] : []
    })
    .join("\n")
}

const discoveredTool = (
  server: string,
  tool: { name: string; description?: string | undefined; inputSchema: unknown; outputSchema?: unknown },
): Effect.Effect<DiscoveredTool, McpConnectionFailed> =>
  Effect.all({
    inputSchema: Schema.decodeUnknownEffect(Schema.Json)(tool.inputSchema),
    outputSchema:
      tool.outputSchema === undefined
        ? Effect.succeed<JsonValue>({})
        : Schema.decodeUnknownEffect(Schema.Json)(tool.outputSchema),
  }).pipe(
    Effect.mapError((error) => McpConnectionFailed.make({ server, message: error.message })),
    Effect.map(({ inputSchema, outputSchema }) => ({
      name: `${server}_${tool.name}`,
      rawName: tool.name,
      description: tool.description ?? "",
      inputSchema,
      outputSchema,
    })),
  )

const jsonObject = Schema.Record(Schema.String, Schema.Unknown)

const callArguments = (input: JsonValue): Record<string, unknown> | undefined => {
  const decoded = Schema.decodeUnknownOption(jsonObject)(input)
  return Option.isSome(decoded) ? decoded.value : undefined
}

const asJsonSchema = (value: JsonValue): JsonSchema => {
  const decoded = Schema.decodeUnknownOption(jsonObject)(value)
  return Option.isSome(decoded) ? decoded.value : {}
}

const aiToolFromDiscovered = (tool: DiscoveredTool): McpAiTool =>
  Tool.dynamic(tool.name, {
    description: tool.description,
    parameters: asJsonSchema(tool.inputSchema),
    success: Schema.Unknown,
    failure: McpToolFailure,
    failureMode: "return",
  })

/** @experimental */
export const fromTransport: {
  (
    transport: Transport,
    options?: CallOptions,
  ): (name: string) => Effect.Effect<Interface, McpConnectionFailed | OAuthProviderError, Scope.Scope>
  (
    name: string,
    transport: Transport,
    options?: CallOptions,
  ): Effect.Effect<Interface, McpConnectionFailed | OAuthProviderError, Scope.Scope>
} = Function.dual(
  (args) => typeof args[0] === "string",
  (name: string, transport: Transport, options?: CallOptions) =>
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const connectedClient = new Client({ name: `tenetkit/mcp:${name}`, version: "0.0.0" })
          yield* Effect.tryPromise({
            try: () => connectedClient.connect(transport),
            catch: (error) => connectionError(name, error),
          }).pipe(Effect.tapError(() => Effect.tryPromise(() => connectedClient.close()).pipe(Effect.ignore)))
          return connectedClient
        }),
        (connected) => Effect.tryPromise(() => connected.close()).pipe(Effect.ignore),
      )

      const listed = yield* Effect.tryPromise({
        try: () => client.listTools(),
        catch: (error) => connectionError(name, error),
      })
      const discoveredTools = yield* Effect.forEach(listed.tools, (tool) => discoveredTool(name, tool), {
        concurrency: 1,
      })
      const discovered = yield* Ref.make<ReadonlyArray<DiscoveredTool>>(discoveredTools)

      const callTimeoutMillis = options?.callTimeout === undefined ? undefined : Duration.toMillis(options.callTimeout)

      const callTool = (rawName: string, input: JsonValue): Effect.Effect<JsonValue, McpToolCallFailed> =>
        Effect.tryPromise({
          try: (signal) =>
            client.callTool({ name: rawName, arguments: callArguments(input) }, undefined, {
              signal,
              ...(callTimeoutMillis === undefined ? {} : { timeout: callTimeoutMillis }),
            }),
          catch: (error) => McpToolCallFailed.make({ server: name, tool: rawName, message: errorMessage(error) }),
        }).pipe(
          Effect.flatMap((result) => {
            if (result.isError === true) {
              const message = joinedText(result.content)
              return Effect.fail(
                McpToolCallFailed.make({
                  server: name,
                  tool: rawName,
                  message: message === "" ? "Tool call failed" : message,
                }),
              )
            }
            if (result.structuredContent !== undefined) {
              return Schema.decodeUnknownEffect(Schema.Json)(result.structuredContent).pipe(
                Effect.mapError((error) =>
                  McpToolCallFailed.make({ server: name, tool: rawName, message: error.message }),
                ),
              )
            }
            return Effect.succeed<JsonValue>(joinedText(result.content))
          }),
        )

      return McpToolSource.of({
        server: name,
        tools: Ref.get(discovered),
        callTool,
        aiTools: Ref.get(discovered).pipe(Effect.map((tools) => tools.map(aiToolFromDiscovered))),
      })
    }),
)

const buildTransport = (server: string, transport: McpTransport): Effect.Effect<Transport, McpConnectionFailed> =>
  Effect.try({
    try: (): Transport =>
      transport.kind === "stdio"
        ? new StdioClientTransport({
            command: transport.command,
            ...(transport.args === undefined ? {} : { args: [...transport.args] }),
            ...(transport.env === undefined ? {} : { env: transport.env }),
          })
        : (new StreamableHTTPClientTransport(new URL(transport.url), {
            ...(transport.headers === undefined ? {} : { requestInit: { headers: transport.headers } }),
            ...(transport.oauth === undefined ? {} : { authProvider: transport.oauth.provider }),
          }) as Transport),
    catch: (error) => McpConnectionFailed.make({ server, message: errorMessage(error) }),
  })

const makeInterface = (options: {
  readonly name: string
  readonly transport: McpTransport
  readonly callTimeout?: Duration.Input
}): Effect.Effect<Interface, McpConnectionFailed | OAuthPending | OAuthProviderError, Scope.Scope> => {
  const connect = buildTransport(options.name, options.transport).pipe(
    Effect.flatMap((transport) =>
      fromTransport(
        options.name,
        transport,
        options.callTimeout === undefined ? undefined : { callTimeout: options.callTimeout },
      ),
    ),
  )
  const oauth = options.transport.kind === "http" ? options.transport.oauth : undefined
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
export const layer = (options: {
  readonly name: string
  readonly transport: McpTransport
  readonly callTimeout?: Duration.Input
}): Layer.Layer<McpToolSource, McpConnectionFailed | OAuthPending | OAuthProviderError> =>
  Layer.effect(McpToolSource, makeInterface(options))

/** @experimental */
export const layerTagged: {
  (options: {
    readonly name: string
    readonly transport: McpTransport
    readonly callTimeout?: Duration.Input
  }): <Identifier>(
    tag: Context.Key<Identifier, Interface>,
  ) => Layer.Layer<Identifier, McpConnectionFailed | OAuthPending | OAuthProviderError>
  <Identifier>(
    tag: Context.Key<Identifier, Interface>,
    options: {
      readonly name: string
      readonly transport: McpTransport
      readonly callTimeout?: Duration.Input
    },
  ): Layer.Layer<Identifier, McpConnectionFailed | OAuthPending | OAuthProviderError>
} = Function.dual(
  2,
  <Identifier>(
    tag: Context.Key<Identifier, Interface>,
    options: {
      readonly name: string
      readonly transport: McpTransport
      readonly callTimeout?: Duration.Input
    },
  ) => Layer.effect(tag, makeInterface(options)),
)
