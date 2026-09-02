import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Deferred, type Duration, Effect, Option, type Scope, Schema } from "effect"
import { MCPClient, OAuth } from "../../../src/unstable/mcp/index.ts"

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

const AddArguments = Schema.Struct({ a: Schema.Finite, b: Schema.Finite })

export interface Fixture {
  readonly source: MCPClient.Service
  readonly closes: { count: number }
  readonly hang: { readonly started: Deferred.Deferred<void>; readonly aborted: Deferred.Deferred<void> }
}

export interface TransportFixture {
  readonly transport: Transport
  readonly closes: { count: number }
  readonly concurrent: { readonly max: number }
  readonly hang: { readonly started: Deferred.Deferred<void>; readonly aborted: Deferred.Deferred<void> }
}

export class FixtureSetupError extends Schema.TaggedError<FixtureSetupError>()("FixtureSetupError", {
  server: Schema.String,
  message: Schema.String,
}) {}

class FixtureTransportCloseError extends Schema.TaggedError<FixtureTransportCloseError>()(
  "FixtureTransportCloseError",
  { message: Schema.String },
) {}

export const makeTransportFixture = (options?: {
  readonly malformedDiscoverySchema?: "input" | "output"
  readonly malformedStructuredContent?: boolean
  readonly closes?: { count: number }
  readonly rejectClose?: boolean
}): Effect.Effect<TransportFixture, FixtureSetupError> =>
  Effect.gen(function* () {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

    const hangStarted = yield* Deferred.make<void>()
    const hangAborted = yield* Deferred.make<void>()
    const hangResponse = yield* Deferred.make<never>()
    const concurrentGate = yield* Deferred.make<void>()
    const concurrent = { active: 0, max: 0 }
    const runtime = yield* Effect.context<never>()

    const server = new McpServer({ name: "calc", version: "1.0.0" }, { capabilities: { tools: {} } })
    server.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        { name: "add", description: "Add two numbers", inputSchema: addInputSchema },
        { name: "barrier_add", description: "Add concurrently", inputSchema: addInputSchema },
        {
          name: "stats",
          description: "Structured stats",
          inputSchema:
            options?.malformedDiscoverySchema === "input"
              ? { ...statsInputSchema, default: undefined }
              : statsInputSchema,
          outputSchema:
            options?.malformedDiscoverySchema === "output"
              ? { ...statsOutputSchema, default: undefined }
              : statsOutputSchema,
        },
        { name: "boom", description: "Always fails", inputSchema: { type: "object" as const, properties: {} } },
        { name: "hang", description: "Never responds", inputSchema: { type: "object" as const, properties: {} } },
      ],
    }))
    server.server.setRequestHandler(CallToolRequestSchema, (request, extra) => {
      if (request.params.name === "add" || request.params.name === "barrier_add") {
        const decoded = Schema.decodeUnknownOption(AddArguments)(request.params.arguments)
        if (Option.isNone(decoded)) {
          return { content: [{ type: "text" as const, text: "invalid arguments" }], isError: true }
        }
        const args = decoded.value
        if (request.params.name === "barrier_add") {
          concurrent.active += 1
          concurrent.max = Math.max(concurrent.max, concurrent.active)
          if (concurrent.active === 2) Effect.runForkWith(runtime)(Deferred.succeed(concurrentGate, undefined))
          return Effect.runPromiseWith(runtime)(
            Deferred.await(concurrentGate).pipe(
              Effect.ensuring(
                Effect.sync(() => {
                  concurrent.active -= 1
                }),
              ),
              Effect.as({ content: [{ type: "text" as const, text: String(args.a + args.b) }] }),
            ),
            { signal: extra.signal },
          )
        }
        return { content: [{ type: "text" as const, text: String(args.a + args.b) }] }
      }
      if (request.params.name === "stats") {
        const structuredContent =
          options?.malformedStructuredContent === true ? { sum: 42, invalid: undefined } : { sum: 42 }
        return {
          content: [
            { type: "text" as const, text: Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({ sum: 42 }) },
          ],
          structuredContent,
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
    yield* Effect.tryPromise({
      try: () => server.connect(serverTransport),
      catch: (error) =>
        FixtureSetupError.make({ server: "calc", message: `MCP fixture connection failed: ${String(error)}` }),
    })

    const closes = options?.closes ?? { count: 0 }
    const originalClose = clientTransport.close.bind(clientTransport)
    clientTransport.close = () => {
      const closeEffect: Effect.Effect<void, FixtureTransportCloseError> =
        options?.rejectClose === true
          ? Effect.fail(FixtureTransportCloseError.make({ message: "transport close failed" }))
          : Effect.tryPromise({
              try: originalClose,
              catch: (error) => FixtureTransportCloseError.make({ message: String(error) }),
            })
      return Effect.runPromiseWith(runtime)(
        Effect.sync(() => {
          closes.count += 1
        }).pipe(Effect.andThen(closeEffect)),
      )
    }

    return {
      transport: clientTransport,
      closes,
      concurrent: {
        get max() {
          return concurrent.max
        },
      },
      hang: { started: hangStarted, aborted: hangAborted },
    }
  })

export const makeFixtureWith = (options?: {
  readonly callTimeout?: Duration.Input
  readonly malformedDiscoverySchema?: "input" | "output"
  readonly malformedStructuredContent?: boolean
  readonly closes?: { count: number }
  readonly rejectClose?: boolean
}): Effect.Effect<Fixture, FixtureSetupError | MCPClient.MCPConnectionFailed | OAuth.OAuthProviderError, Scope.Scope> =>
  Effect.gen(function* () {
    const fixture = yield* makeTransportFixture(options)
    const source = yield* MCPClient.fromTransport("calc", fixture.transport, options)
    return { source, closes: fixture.closes, hang: fixture.hang }
  })

export const makeFixture: Effect.Effect<
  Fixture,
  FixtureSetupError | MCPClient.MCPConnectionFailed | OAuth.OAuthProviderError,
  Scope.Scope
> = makeFixtureWith()
