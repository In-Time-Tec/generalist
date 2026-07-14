import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Duration, Effect, Function, Layer, Ref, Schema, Scope } from "effect"
import type { JsonSchema } from "effect/JsonSchema"
import { Tool } from "effect/unstable/ai"
import type { Interface as OAuthInterface } from "./oauth.js"
/** @experimental */
export type JsonValue = Schema.Json

/** @experimental */
export type McpAiTool = Tool.Dynamic<
  string,
  {
    readonly parameters: JsonSchema
    readonly success: typeof Schema.Unknown
    readonly failure: typeof Schema.String
    readonly failureMode: "return"
  }
>

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
      readonly oauth?: OAuthInterface
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

const jsonValue = (value: unknown): JsonValue => Schema.decodeUnknownSync(Schema.Json)(value)

const discoveredTool = (
  server: string,
  tool: { name: string; description?: string | undefined; inputSchema: unknown; outputSchema?: unknown },
): DiscoveredTool => ({
  name: `${server}_${tool.name}`,
  rawName: tool.name,
  description: tool.description ?? "",
  inputSchema: jsonValue(tool.inputSchema),
  outputSchema: tool.outputSchema === undefined ? {} : jsonValue(tool.outputSchema),
})

const callArguments = (input: JsonValue): Record<string, unknown> | undefined =>
  typeof input === "object" && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : undefined

const aiToolFromDiscovered = (tool: DiscoveredTool): McpAiTool =>
  Tool.dynamic(tool.name, {
    description: tool.description,
    parameters: tool.inputSchema as JsonSchema,
    success: Schema.Unknown,
    failure: Schema.String,
    failureMode: "return",
  })

/** @experimental */
export const fromTransport: {
  (
    transport: Transport,
    options?: CallOptions,
  ): (name: string) => Effect.Effect<Interface, McpConnectionError, Scope.Scope>
  (name: string, transport: Transport, options?: CallOptions): Effect.Effect<Interface, McpConnectionError, Scope.Scope>
} = Function.dual(
  (args) => typeof args[0] === "string",
  (name: string, transport: Transport, options?: CallOptions) =>
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          const created = new Client({ name: `@batonfx/mcp:${name}`, version: "0.0.0" })
          yield* Effect.tryPromise({
            try: () => created.connect(transport),
            catch: (error) => McpConnectionError.make({ server: name, message: errorMessage(error) }),
          })
          return created
        }),
        (connected) => Effect.promise(() => connected.close()).pipe(Effect.ignore),
      )

      const listed = yield* Effect.tryPromise({
        try: () => client.listTools(),
        catch: (error) => McpConnectionError.make({ server: name, message: errorMessage(error) }),
      })
      const discovered = yield* Ref.make<ReadonlyArray<DiscoveredTool>>(
        listed.tools.map((tool) => discoveredTool(name, tool)),
      )

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
            if (result.structuredContent !== undefined) return Effect.succeed(jsonValue(result.structuredContent))
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
}): Effect.Effect<Interface, McpConnectionError, Scope.Scope> =>
  buildTransport(options.name, options.transport).pipe(
    Effect.flatMap((transport) =>
      fromTransport(
        options.name,
        transport,
        options.callTimeout === undefined ? undefined : { callTimeout: options.callTimeout },
      ),
    ),
  )

/** @experimental */
export const layer = (options: {
  readonly name: string
  readonly transport: McpTransport
  readonly callTimeout?: Duration.Input
}): Layer.Layer<McpToolSource, McpConnectionError> => Layer.effect(McpToolSource, makeInterface(options))

/** @experimental */
export const layerTagged: {
  (options: {
    readonly name: string
    readonly transport: McpTransport
    readonly callTimeout?: Duration.Input
  }): <Identifier>(tag: Context.Key<Identifier, Interface>) => Layer.Layer<Identifier, McpConnectionError>
  <Identifier>(
    tag: Context.Key<Identifier, Interface>,
    options: {
      readonly name: string
      readonly transport: McpTransport
      readonly callTimeout?: Duration.Input
    },
  ): Layer.Layer<Identifier, McpConnectionError>
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
