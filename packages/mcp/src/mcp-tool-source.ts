import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Duration, Effect, Function, Layer, Option, Ref, Schema, Scope } from "effect"
import type { JsonSchema } from "effect/JsonSchema"
import { Tool } from "effect/unstable/ai"
import { OAuthPendingError, OAuthProviderError } from "./oauth.js"
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
export class McpConnectionError extends Schema.TaggedErrorClass<McpConnectionError>()("McpConnectionError", {
  server: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export class McpToolCallError extends Schema.TaggedErrorClass<McpToolCallError>()("McpToolCallError", {
  server: Schema.String,
  tool: Schema.String,
  message: Schema.String,
}) {}

/** @experimental */
export const McpToolFailure = Schema.Struct(McpToolCallError.fields)

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
  readonly callTool: (rawName: string, input: JsonValue) => Effect.Effect<JsonValue, McpToolCallError>
  readonly aiTools: Effect.Effect<ReadonlyArray<McpAiTool>>
}

/** @experimental */
export class McpToolSource extends Context.Service<McpToolSource, Interface>()(
  "@batonfx/mcp/mcp-tool-source/McpToolSource",
) {}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error)

const connectionError = (server: string, error: unknown): McpConnectionError | OAuthProviderError =>
  Schema.is(OAuthProviderError)(error) ? error : McpConnectionError.make({ server, message: errorMessage(error) })

const sanitizedConnectionError = (server: string): McpConnectionError =>
  McpConnectionError.make({ server, message: "MCP connection failed" })

const joinedText = (content: unknown): string => {
  if (!Array.isArray(content)) return ""
  return content
    .filter(
      (part): part is { readonly type: "text"; readonly text: string } =>
        typeof part === "object" &&
        part !== null &&
        (part as { type?: unknown }).type === "text" &&
        typeof (part as { text?: unknown }).text === "string",
    )
    .map((part) => part.text)
    .join("\n")
}

const discoveredTool = (
  server: string,
  tool: { name: string; description?: string | undefined; inputSchema: unknown; outputSchema?: unknown },
): Effect.Effect<DiscoveredTool, McpConnectionError> =>
  Effect.all({
    inputSchema: Schema.decodeUnknownEffect(Schema.Json)(tool.inputSchema),
    outputSchema:
      tool.outputSchema === undefined
        ? Effect.succeed<JsonValue>({})
        : Schema.decodeUnknownEffect(Schema.Json)(tool.outputSchema),
  }).pipe(
    Effect.mapError((error) => McpConnectionError.make({ server, message: error.message })),
    Effect.map(({ inputSchema, outputSchema }) => ({
      name: `${server}_${tool.name}`,
      rawName: tool.name,
      description: tool.description ?? "",
      inputSchema,
      outputSchema,
    })),
  )

const callArguments = (input: JsonValue): Record<string, unknown> | undefined =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined

const aiToolFromDiscovered = (tool: DiscoveredTool): McpAiTool =>
  Tool.dynamic(tool.name, {
    description: tool.description,
    parameters: tool.inputSchema as JsonSchema,
    success: Schema.Unknown,
    failure: McpToolFailure,
    failureMode: "return",
  })

/** @experimental */
export const fromTransport: {
  (
    transport: Transport,
    options?: CallOptions,
  ): (name: string) => Effect.Effect<Interface, McpConnectionError | OAuthProviderError, Scope.Scope>
  (
    name: string,
    transport: Transport,
    options?: CallOptions,
  ): Effect.Effect<Interface, McpConnectionError | OAuthProviderError, Scope.Scope>
} = Function.dual(
  (args) => typeof args[0] === "string",
  (name: string, transport: Transport, options?: CallOptions) =>
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.sync(() => new Client({ name: `@batonfx/mcp:${name}`, version: "0.0.0" })),
        (connected) => Effect.tryPromise(() => connected.close()).pipe(Effect.ignore),
      )
      yield* Effect.tryPromise({
        try: () => client.connect(transport),
        catch: (error) => connectionError(name, error),
      })

      const listed = yield* Effect.tryPromise({
        try: () => client.listTools(),
        catch: (error) => connectionError(name, error),
      })
      const discoveredTools = yield* Effect.forEach(listed.tools, (tool) => discoveredTool(name, tool), {
        concurrency: 1,
      })
      const discovered = yield* Ref.make<ReadonlyArray<DiscoveredTool>>(discoveredTools)

      const callTimeoutMillis = options?.callTimeout === undefined ? undefined : Duration.toMillis(options.callTimeout)

      const callTool = (rawName: string, input: JsonValue): Effect.Effect<JsonValue, McpToolCallError> =>
        Effect.tryPromise({
          try: (signal) =>
            client.callTool({ name: rawName, arguments: callArguments(input) }, undefined, {
              signal,
              ...(callTimeoutMillis === undefined ? {} : { timeout: callTimeoutMillis }),
            }),
          catch: (error) => McpToolCallError.make({ server: name, tool: rawName, message: errorMessage(error) }),
        }).pipe(
          Effect.flatMap((result) => {
            if (result.isError === true) {
              const message = joinedText(result.content)
              return Effect.fail(
                McpToolCallError.make({
                  server: name,
                  tool: rawName,
                  message: message === "" ? "Tool call failed" : message,
                }),
              )
            }
            if (result.structuredContent !== undefined) {
              return Schema.decodeUnknownEffect(Schema.Json)(result.structuredContent).pipe(
                Effect.mapError((error) =>
                  McpToolCallError.make({ server: name, tool: rawName, message: error.message }),
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

const buildTransport = (server: string, transport: McpTransport): Effect.Effect<Transport, McpConnectionError> =>
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
    catch: (error) => McpConnectionError.make({ server, message: errorMessage(error) }),
  })

const makeInterface = (options: {
  readonly name: string
  readonly transport: McpTransport
  readonly callTimeout?: Duration.Input
}): Effect.Effect<Interface, McpConnectionError | OAuthPendingError | OAuthProviderError, Scope.Scope> => {
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
        Effect.catchTag("McpConnectionError", () =>
          oauth.pending.pipe(
            Effect.flatMap((current): Effect.Effect<never, McpConnectionError | OAuthPendingError> => {
              if (Option.isNone(current)) return Effect.fail(sanitizedConnectionError(options.name))
              if (Option.isSome(before) && before.value.url === current.value.url) {
                return Effect.fail(sanitizedConnectionError(options.name))
              }
              return Effect.fail(OAuthPendingError.make({ authorizationUrl: current.value.url }))
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
}): Layer.Layer<McpToolSource, McpConnectionError | OAuthPendingError | OAuthProviderError> =>
  Layer.effect(McpToolSource, makeInterface(options))

/** @experimental */
export const layerTagged: {
  (options: {
    readonly name: string
    readonly transport: McpTransport
    readonly callTimeout?: Duration.Input
  }): <Identifier>(
    tag: Context.Key<Identifier, Interface>,
  ) => Layer.Layer<Identifier, McpConnectionError | OAuthPendingError | OAuthProviderError>
  <Identifier>(
    tag: Context.Key<Identifier, Interface>,
    options: {
      readonly name: string
      readonly transport: McpTransport
      readonly callTimeout?: Duration.Input
    },
  ): Layer.Layer<Identifier, McpConnectionError | OAuthPendingError | OAuthProviderError>
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
