import { describe, expect, it } from "@effect/vitest"
import { Agent, Approvals, ModelMiddleware, Response, ToolContext, ToolExecutor } from "tenetkit"
import { TestModel } from "tenetkit/test"
import { Context, Effect, Layer, Schema, Stream } from "effect"
import { layerToolkit, route, toolkit } from "../../src/mcp/mcp/tools"
import { McpToolSource } from "../../src/mcp/index"
import { makeFixture, makeTransportFixture } from "./fixture"

describe("baton adapter", () => {
  it("exports the complete scoped route", () => {
    expect(typeof route).toBe("function")
  })

  it.effect("exposes discovered tools as a toolkit", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const kit = yield* toolkit(source)
        expect(Object.keys(kit.tools).toSorted()).toEqual([
          "calc_add",
          "calc_barrier_add",
          "calc_boom",
          "calc_hang",
          "calc_stats",
        ])
      }),
    ),
  )

  it.effect("builds handlers that proxy tool calls to the server", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const handlers = yield* Layer.build(layerToolkit(source))
        expect(handlers).toBeDefined()
        expect(yield* source.callTool("add", { a: 40, b: 2 })).toBe("42")
      }),
    ),
  )

  it.effect("builds handlers for failing server tools", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const handlers = yield* Layer.build(layerToolkit(source))
        expect(handlers).toBeDefined()
        const error = yield* Effect.flip(source.callTool("boom", {}))
        expect(error.message).toContain("boom failed")
      }),
    ),
  )

  it.effect("runs an Agent through a discovered MCP tool and owns the connection scope", () =>
    Effect.gen(function* () {
      const fixture = yield* makeTransportFixture()
      yield* Effect.scoped(
        Effect.gen(function* () {
          const tools = yield* route({ name: "calc", transport: fixture.transport })
          const model = yield* TestModel.make([
            TestModel.toolCall("calc_add", { a: 20, b: 22 }, { id: "add-1" }),
            TestModel.text("the answer is 42"),
          ])
          const agent = Agent.make({ name: "mcp-agent", toolkit: tools.toolkit })
          const services = yield* Layer.build(
            Layer.mergeAll(model.layer, tools.executorLayer, Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
          )
          const result = yield* Agent.generate(agent, { prompt: "add the numbers" }).pipe(Effect.provide(services))
          const prompts = yield* model.prompts
          const secondPrompt = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(prompts[1])

          expect(result.text).toBe("the answer is 42")
          expect(secondPrompt).toContain("42")
          expect(fixture.closes.count).toBe(0)
        }),
      )
      expect(fixture.closes.count).toBeGreaterThanOrEqual(1)
    }),
  )

  it.effect("preserves structured MCP failures as failed Agent tool results", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeTransportFixture()
        const tools = yield* route({ name: "calc", transport: fixture.transport })
        const model = yield* TestModel.make([
          TestModel.toolCall("calc_boom", {}, { id: "boom-1" }),
          TestModel.text("recovered from the tool failure"),
        ])
        const agent = Agent.make({ name: "mcp-agent", toolkit: tools.toolkit })
        const services = yield* Layer.build(
          Layer.mergeAll(model.layer, tools.executorLayer, Approvals.layerAutoApprove, ModelMiddleware.layerIdentity),
        )
        const events = yield* Agent.stream(agent, { prompt: "call boom" }).pipe(
          Stream.runCollect,
          Effect.provide(services),
        )
        const completed = events.find((event) => event._tag === "ToolExecutionCompleted")

        expect(completed?._tag).toBe("ToolExecutionCompleted")
        if (completed?._tag === "ToolExecutionCompleted") {
          expect(completed.result.isFailure).toBe(true)
          expect(completed.result.result).toEqual({
            _tag: "tenetkit/mcp/McpToolCallFailed",
            server: "calc",
            tool: "boom",
            message: "boom failed",
          })
          expect(completed.result.encodedResult).toEqual(completed.result.result)
        }
        const final = events.at(-1)
        expect(final?._tag === "Completed" && final.text).toBe("recovered from the tool failure")
      }),
    ),
  )

  it.effect("supports concurrent calls through one routed executor", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeTransportFixture()
        const tools = yield* route({ name: "calc", transport: fixture.transport })
        const services = yield* Layer.build(Layer.mergeAll(tools.executorLayer, ToolContext.layerDefault))
        const executor = Context.get(services, ToolExecutor.ToolExecutor)
        const call1 = Response.makePart("tool-call", {
          id: "add-1",
          name: "calc_barrier_add",
          params: { a: 20, b: 22 },
          providerExecuted: false,
        })
        const call2 = Response.makePart("tool-call", {
          id: "add-2",
          name: "calc_barrier_add",
          params: { a: 19, b: 23 },
          providerExecuted: false,
        })
        const calls = [call1, call2]
        const execute = (toolCallIndex: 0 | 1) =>
          executor
            .execute({
              call: toolCallIndex === 0 ? call1 : call2,
              toolCallBatch: { calls },
              turn: 0,
              toolCallIndex,
              agentName: "concurrent-agent",
              sessionId: "concurrent-session",
            })
            .pipe(Effect.provide(services))
        const outcomes = yield* Effect.all([execute(0), execute(1)], {
          concurrency: 2,
        })

        expect(outcomes).toEqual([
          { _tag: "Success", result: "42", encodedResult: "42" },
          { _tag: "Success", result: "42", encodedResult: "42" },
        ])
        expect(fixture.concurrent.max).toBe(2)
      }),
    ),
  )

  it.effect("recognizes a custom SDK transport before declarative kind metadata", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeTransportFixture()
        const transport = Object.assign(fixture.transport, { kind: "http" as const })
        const tools = yield* route({ name: "calc", transport })

        expect(Object.keys(tools.toolkit.tools)).toContain("calc_add")
      }),
    ),
  )

  it.effect("keeps transport construction failures typed on route acquisition", () =>
    Effect.gen(function* () {
      const error = yield* route({ name: "broken", transport: { kind: "http", url: "://invalid" } }).pipe(
        Effect.scoped,
        Effect.flip,
      )

      expect(error).toBeInstanceOf(McpToolSource.McpConnectionFailed)
      if (error._tag === "tenetkit/mcp/McpConnectionFailed") expect(error.server).toBe("broken")
    }),
  )
})
