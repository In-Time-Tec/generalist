import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Ai from "effect/unstable/ai"
import { McpToolSource } from "../src/index"
import { addInputSchema, makeFixture, statsOutputSchema } from "./fixture"

describe("McpToolSource", () => {
  it.effect("discovers namespaced tools with schema passthrough", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const tools = yield* source.tools

        expect(source.server).toBe("calc")
        expect(tools.map((tool) => tool.name)).toEqual(["calc_add", "calc_stats", "calc_boom"])
        const add = tools[0]
        expect(add?.rawName).toBe("add")
        expect(add?.description).toBe("Add two numbers")
        expect(add?.inputSchema).toEqual(addInputSchema)
        expect(add?.outputSchema).toEqual({})
        expect(tools[1]?.outputSchema).toEqual(statsOutputSchema)
      }),
    ),
  )

  it.effect("exposes discovered tools as dynamic Ai tools", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const aiTools = yield* source.aiTools

        expect(aiTools.map((tool) => tool.name)).toEqual(["calc_add", "calc_stats", "calc_boom"])
        const add = aiTools[0]
        expect(add === undefined ? undefined : Ai.Tool.getDescription(add)).toBe("Add two numbers")
        expect(add === undefined ? undefined : Ai.Tool.getJsonSchema(add)).toEqual(addInputSchema)
      }),
    ),
  )

  it.effect("round-trips callTool text results", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const output = yield* source.callTool("add", { a: 20, b: 22 })
        expect(output).toBe("42")
      }),
    ),
  )

  it.effect("passes structured content through", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const output = yield* source.callTool("stats", {})
        expect(output).toEqual({ sum: 42 })
      }),
    ),
  )

  it.effect("fails typed when the server reports isError", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const error = yield* Effect.flip(source.callTool("boom", {}))

        expect(error).toBeInstanceOf(McpToolSource.McpToolCallError)
        expect(error._tag).toBe("McpToolCallError")
        expect(error.server).toBe("calc")
        expect(error.tool).toBe("boom")
        expect(error.message).toContain("boom failed")
      }),
    ),
  )

  it.effect("closes the connection on scope release", () =>
    Effect.gen(function* () {
      const closes = yield* Effect.scoped(
        Effect.gen(function* () {
          const fixture = yield* makeFixture
          yield* fixture.source.tools
          expect(fixture.closes.count).toBe(0)
          return fixture.closes
        }),
      )
      // The linked in-memory pair cascades close events, so the spy can fire
      // more than once; release must have closed the transport at least once.
      expect(closes.count).toBeGreaterThanOrEqual(1)
    }),
  )
})
