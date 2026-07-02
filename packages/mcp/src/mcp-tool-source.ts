import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Effect, Layer, Ref, Schema, Scope } from "effect"
import * as Ai from "effect/unstable/ai"

/**
 * @experimental JSON value vocabulary of the MCP bridge. Structurally identical
 * to Relay's `Shared.JsonValue`; declared locally so the core module depends on
 * `effect` and the MCP SDK only.
 */
export type JsonValue = typeof Schema.Json.Type

/** @experimental Transport configuration for a single MCP server connection. */
export type McpTransport =
  | {
      readonly kind: "stdio"
      readonly command: string
      readonly args?: ReadonlyArray<string>
      readonly env?: Record<string, string>
    }
  | { readonly kind: "http"; readonly url: string; readonly headers?: Record<string, string> } // Streamable HTTP

/** @experimental Connecting to (or handshaking with) an MCP server failed. */
export class McpConnectionError extends Schema.TaggedErrorClass<McpConnectionError>()("McpConnectionError", {
  server: Schema.String,
  message: Schema.String,
}) {}

/** @experimental A tools/call failed: transport error or a result with `isError: true`. */
export class McpToolCallError extends Schema.TaggedErrorClass<McpToolCallError>()("McpToolCallError", {
  server: Schema.String,
  tool: Schema.String,
  message: Schema.String,
}) {}

/** @experimental A tool discovered from a connected MCP server's tools/list. */
export interface DiscoveredTool {
  readonly name: string // namespaced: `<server>_<tool>` to avoid cross-server collisions
  readonly rawName: string // the server's tool name
  readonly description: string
  readonly inputSchema: JsonValue // JSON Schema from tools/list, passed through untouched
  readonly outputSchema: JsonValue // {} when the server declares none
}

/** @experimental */
export interface Interface {
  readonly server: string
  readonly tools: Effect.Effect<ReadonlyArray<DiscoveredTool>>
  readonly callTool: (rawName: string, input: JsonValue) => Effect.Effect<JsonValue, McpToolCallError>
  /** DiscoveredTools as Ai.Tool.dynamic values (parameters = inputSchema, success = Schema.Unknown). */
  readonly aiTools: Effect.Effect<ReadonlyArray<Ai.Tool.Any>>
}

/** @experimental */
export class McpToolSource extends Context.Service<McpToolSource, Interface>()("@batonfx/mcp/McpToolSource") {}

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

const aiToolFromDiscovered = (tool: DiscoveredTool): Ai.Tool.Any =>
  Ai.Tool.dynamic(tool.name, {
    description: tool.description,
    parameters: tool.inputSchema as never,
    success: Schema.Unknown,
  })

/**
 * Scoped constructor from a pre-built MCP SDK transport: connects on acquire,
 * lists tools once, closes the client (and its transport) on scope release.
 *
 * This is the seam `layer` is built on; it is exported so tests (and unusual
 * hosts) can bring their own transport, e.g. the SDK's `InMemoryTransport`.
 *
 * @experimental
 */
export const fromTransport = (
  name: string,
  transport: Transport,
): Effect.Effect<Interface, McpConnectionError, Scope.Scope> =>
  Effect.gen(function* () {
    const client = yield* Effect.acquireRelease(
      Effect.tryPromise({
        try: async () => {
          const created = new Client({ name: `@batonfx/mcp:${name}`, version: "0.0.0" })
          await created.connect(transport)
          return created
        },
        catch: (error) => new McpConnectionError({ server: name, message: errorMessage(error) }),
      }),
      (connected) => Effect.promise(() => connected.close()).pipe(Effect.ignore),
    )

    const listed = yield* Effect.tryPromise({
      try: () => client.listTools(),
      catch: (error) => new McpConnectionError({ server: name, message: errorMessage(error) }),
    })
    const discovered = yield* Ref.make<ReadonlyArray<DiscoveredTool>>(
      listed.tools.map((tool) => discoveredTool(name, tool)),
    )

    const callTool = (rawName: string, input: JsonValue): Effect.Effect<JsonValue, McpToolCallError> =>
      Effect.tryPromise({
        try: () => client.callTool({ name: rawName, arguments: callArguments(input) }),
        catch: (error) => new McpToolCallError({ server: name, tool: rawName, message: errorMessage(error) }),
      }).pipe(
        Effect.flatMap((result) => {
          if (result.isError === true) {
            const message = joinedText(result.content)
            return Effect.fail(
              new McpToolCallError({
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
  })

const buildTransport = (server: string, transport: McpTransport): Effect.Effect<Transport, McpConnectionError> =>
  Effect.try({
    try: (): Transport =>
      transport.kind === "stdio"
        ? new StdioClientTransport({
            command: transport.command,
            ...(transport.args === undefined ? {} : { args: [...transport.args] }),
            ...(transport.env === undefined ? {} : { env: transport.env }),
          })
        : (new StreamableHTTPClientTransport(
            new URL(transport.url),
            transport.headers === undefined ? {} : { requestInit: { headers: transport.headers } },
          ) as Transport),
    catch: (error) => new McpConnectionError({ server, message: errorMessage(error) }),
  })

const makeInterface = (options: {
  readonly name: string
  readonly transport: McpTransport
}): Effect.Effect<Interface, McpConnectionError, Scope.Scope> =>
  buildTransport(options.name, options.transport).pipe(
    Effect.flatMap((transport) => fromTransport(options.name, transport)),
  )

/**
 * Scoped layer: connects on acquire (Client + transport from
 * `@modelcontextprotocol/sdk`), lists tools once, closes on release.
 *
 * One layer serves one MCP server. For multiple servers, either merge multiple
 * uniquely-tagged layers via {@link layerTagged} or use separate service tags:
 *
 * ```ts
 * const GithubSource = Context.Service<GithubSource, McpToolSource.Interface>()("app/GithubSource")
 * const JiraSource = Context.Service<JiraSource, McpToolSource.Interface>()("app/JiraSource")
 * const sources = Layer.mergeAll(
 *   McpToolSource.layerTagged(GithubSource, { name: "github", transport: { kind: "stdio", command: "github-mcp" } }),
 *   McpToolSource.layerTagged(JiraSource, { name: "jira", transport: { kind: "http", url: "https://jira.example/mcp" } }),
 * )
 * ```
 *
 * @experimental
 */
export const layer = (options: {
  readonly name: string // server label used for namespacing + errors
  readonly transport: McpTransport
}): Layer.Layer<McpToolSource, McpConnectionError> => Layer.effect(McpToolSource, makeInterface(options))

/**
 * As {@link layer}, but provides the source under a consumer-owned tag so N
 * servers can coexist in one context (the `McpToolSource` class tag is unique).
 *
 * @experimental
 */
export const layerTagged = <Identifier>(
  tag: Context.Key<Identifier, Interface>,
  options: {
    readonly name: string
    readonly transport: McpTransport
  },
): Layer.Layer<Identifier, McpConnectionError> => Layer.effect(tag, makeInterface(options))
