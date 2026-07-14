import { describe, expect, it } from "@effect/vitest"
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js"
import { Deferred, Effect, Fiber, Option } from "effect"
import { Tool } from "effect/unstable/ai"
import { McpToolSource } from "../src/index"
import { addInputSchema, makeFixture, makeFixtureWith, statsOutputSchema } from "./fixture"

describe("McpToolSource", () => {
  it.effect("preserves connection details for non-OAuth transports", () =>
    Effect.gen(function* () {
      const transport: Transport = {
        start: () => Promise.reject(new Error("custom transport unavailable")),
        send: () => Promise.resolve(),
        close: () => Promise.resolve(),
      }
      const error = yield* McpToolSource.fromTransport("custom", transport).pipe(Effect.flip, Effect.scoped)

      expect(error).toBeInstanceOf(McpToolSource.McpConnectionError)
      expect(error.message).toContain("custom transport unavailable")
    }),
  )

  it.effect("discovers namespaced tools with schema passthrough", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const tools = yield* source.tools

        expect(source.server).toBe("calc")
        expect(tools.map((tool) => tool.name)).toEqual([
          "calc_add",
          "calc_barrier_add",
          "calc_stats",
          "calc_boom",
          "calc_hang",
        ])
        const add = tools[0]
        expect(add?.rawName).toBe("add")
        expect(add?.description).toBe("Add two numbers")
        expect(add?.inputSchema).toEqual(addInputSchema)
        expect(add?.outputSchema).toEqual({})
        expect(tools[2]?.outputSchema).toEqual(statsOutputSchema)
      }),
    ),
  )

  it.effect("exposes discovered tools as dynamic Ai tools", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const aiTools = yield* source.aiTools

        expect(aiTools.map((tool) => tool.name)).toEqual([
          "calc_add",
          "calc_barrier_add",
          "calc_stats",
          "calc_boom",
          "calc_hang",
        ])
        const add = aiTools[0]
        expect(add === undefined ? undefined : Tool.getDescription(add)).toBe("Add two numbers")
        expect(add === undefined ? undefined : Tool.getJsonSchema(add)).toEqual(addInputSchema)
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
      expect(closes.count).toBeGreaterThanOrEqual(1)
    }),
  )

  it.live("interrupting an in-flight call aborts the server-side request", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixture
        const fiber = yield* fixture.source.callTool("hang", {}).pipe(Effect.forkChild)
        yield* Deferred.await(fixture.hang.started)

        yield* Fiber.interrupt(fiber)

        const aborted = yield* Deferred.await(fixture.hang.aborted).pipe(Effect.timeoutOption("500 millis"))
        expect(Option.isSome(aborted)).toBe(true)
      }),
    ),
  )

  it.live("callTool fails typed when the configured call timeout elapses", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeFixtureWith({ callTimeout: "100 millis" })

        const outcome = yield* fixture.source.callTool("hang", {}).pipe(Effect.flip, Effect.timeoutOption("2 seconds"))

        expect(Option.isSome(outcome)).toBe(true)
        if (Option.isSome(outcome)) {
          expect(outcome.value._tag).toBe("McpToolCallError")
          expect(outcome.value.server).toBe("calc")
          expect(outcome.value.tool).toBe("hang")
          expect(outcome.value.message).toContain("timed out")
        }
      }),
    ),
  )
})
