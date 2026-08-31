import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Context, Duration, Effect, Function, Layer, Option, Ref, Schema, Scope } from "effect"
import type { JsonSchema } from "effect/JsonSchema"
import { Tool } from "effect/unstable/ai"
import { OAuthProviderError } from "./oauth.js"
/** @experimental */
export type JsonValue = Schema.Json

/** @experimental */
export interface CallOptions {
  readonly callTimeout?: Duration.Input
}

/** @experimental */
export class MCPConnectionFailed extends Schema.TaggedError<MCPConnectionFailed>()(
  "generalist/mcp/MCPConnectionFailed",
  {
    server: Schema.String,
    message: Schema.String,
  },
) {}

/** @experimental */
export class MCPToolCallFailed extends Schema.TaggedError<MCPToolCallFailed>()("generalist/mcp/MCPToolCallFailed", {
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
export class MCPClient extends Context.Service<MCPClient, Service>()("generalist/mcp/client/MCPClient") {}

const errorDetails = Schema.Struct({ name: Schema.String, message: Schema.String })

const formatErrorDetails = (details: Option.Option<typeof errorDetails.Type>, fallback: string): string =>
  Option.isSome(details) ? `${details.value.name}: ${details.value.message}` : fallback

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
          const connectedClient = new Client({ name: `generalist/mcp:${name}`, version: "0.0.0" })
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

/** @experimental */
export interface Options {
  readonly name: string
  readonly transport: Transport
  readonly callTimeout?: Duration.Input
}

const makeClient = (options: Options): Effect.Effect<Service, MCPConnectionFailed | OAuthProviderError, Scope.Scope> =>
  options.callTimeout === undefined
    ? fromTransport(options.name, options.transport)
    : fromTransport(options.name, options.transport, { callTimeout: options.callTimeout })

/** @experimental */
export const layer = (options: Options): Layer.Layer<MCPClient, MCPConnectionFailed | OAuthProviderError> =>
  Layer.effect(MCPClient, makeClient(options))

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
  Layer.effect(tag, makeClient(options)),
)
