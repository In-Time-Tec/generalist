import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Deferred, type Duration, Effect, type Scope, Schema } from "effect"
import { McpToolSource, OAuth } from "../src/index"

export const addInputSchema = {
  type: "object" as const,
  properties: { a: { type: "number" }, b: { type: "number" } },
  required: ["a", "b"],
}

export const statsInputSchema = { type: "object" as const, properties: {} }

export const statsOutputSchema = {
  type: "object" as const,
  properties: { sum: { type: "number" } },
  required: ["sum"],
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

export interface Fixture {
  readonly source: McpToolSource.Interface
  readonly closes: { count: number }
  readonly hang: { readonly started: Deferred.Deferred<void>; readonly aborted: Deferred.Deferred<void> }
}

export const makeFixtureWith = (options?: {
  readonly callTimeout?: Duration.Input
}): Effect.Effect<Fixture, McpToolSource.McpConnectionError | OAuth.OAuthProviderError, Scope.Scope> =>
  Effect.gen(function* () {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const hangStarted = yield* Deferred.make<void>()
    const hangAborted = yield* Deferred.make<void>()
    const hangResponse = yield* Deferred.make<never>()
    const runtime = yield* Effect.context<never>()

    const server = new Server({ name: "calc", version: "1.0.0" }, { capabilities: { tools: {} } })
    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        { name: "add", description: "Add two numbers", inputSchema: addInputSchema },
        {
          name: "stats",
          description: "Structured stats",
          inputSchema: statsInputSchema,
          outputSchema: statsOutputSchema,
        },
        { name: "boom", description: "Always fails", inputSchema: { type: "object" as const, properties: {} } },
        { name: "hang", description: "Never responds", inputSchema: { type: "object" as const, properties: {} } },
      ],
    }))
    server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      if (request.params.name === "add") {
        const args = request.params.arguments
        if (!isRecord(args) || typeof args.a !== "number" || typeof args.b !== "number") {
          return { content: [{ type: "text" as const, text: "invalid arguments" }], isError: true }
        }
        return { content: [{ type: "text" as const, text: String(args.a + args.b) }] }
      }
      if (request.params.name === "stats") {
        return {
          content: [{ type: "text" as const, text: Schema.encodeSync(Schema.UnknownFromJsonString)({ sum: 42 }) }],
          structuredContent: { sum: 42 },
        }
      }
      if (request.params.name === "hang") {
        Effect.runForkWith(runtime)(Deferred.succeed(hangStarted, undefined))
        extra.signal.addEventListener("abort", () =>
          Effect.runForkWith(runtime)(Deferred.succeed(hangAborted, undefined)),
        )
        return Effect.runPromiseWith(runtime)(Deferred.await(hangResponse), { signal: extra.signal })
      }
      return { content: [{ type: "text" as const, text: "boom failed" }], isError: true }
    })
    yield* Effect.promise(() => server.connect(serverTransport))

    const closes = { count: 0 }
    const originalClose = clientTransport.close.bind(clientTransport)
    clientTransport.close = () =>
      Effect.runPromiseWith(runtime)(
        Effect.sync(() => {
          closes.count += 1
        }).pipe(Effect.andThen(Effect.promise(originalClose))),
      )

    const source = yield* McpToolSource.fromTransport("calc", clientTransport, options)
    return { source, closes, hang: { started: hangStarted, aborted: hangAborted } }
  })

export const makeFixture: Effect.Effect<
  Fixture,
  McpToolSource.McpConnectionError | OAuth.OAuthProviderError,
  Scope.Scope
> = makeFixtureWith()
