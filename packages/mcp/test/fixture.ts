import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import { Effect, Scope } from "effect"
import { McpToolSource } from "../src/index"

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

/**
 * In-process MCP server fixture (SDK low-level `Server` + `InMemoryTransport`
 * linked pair) exposing:
 *
 * - `add(a, b)` — returns the sum as a text part;
 * - `stats()` — declares an output schema and returns structured content;
 * - `boom()` — always returns `isError: true`.
 */
export const makeFixture: Effect.Effect<
  {
    readonly source: McpToolSource.Interface
    readonly closes: { count: number }
  },
  McpToolSource.McpConnectionError,
  Scope.Scope
> = Effect.gen(function* () {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

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
    ],
  }))
  server.setRequestHandler(CallToolRequestSchema, (request) => {
    if (request.params.name === "add") {
      const args = request.params.arguments
      if (!isRecord(args) || typeof args.a !== "number" || typeof args.b !== "number") {
        return { content: [{ type: "text" as const, text: "invalid arguments" }], isError: true }
      }
      return { content: [{ type: "text" as const, text: String(args.a + args.b) }] }
    }
    if (request.params.name === "stats") {
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ sum: 42 }) }],
        structuredContent: { sum: 42 },
      }
    }
    return { content: [{ type: "text" as const, text: "boom failed" }], isError: true }
  })
  yield* Effect.promise(() => server.connect(serverTransport))

  const closes = { count: 0 }
  const originalClose = clientTransport.close.bind(clientTransport)
  clientTransport.close = async () => {
    closes.count += 1
    await originalClose()
  }

  const source = yield* McpToolSource.fromTransport("calc", clientTransport)
  return { source, closes }
})
