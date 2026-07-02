import { ToolExecutor } from "@batonfx/core"
import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import * as Ai from "effect/unstable/ai"
import { toolExecutorLayer, toolkit } from "../src/baton"
import { makeFixture } from "./fixture"

const request = (name: string, params: unknown): ToolExecutor.Request => ({
  call: Ai.Response.makePart("tool-call", { id: `call-${name}`, name, params, providerExecuted: false }),
  turn: 0,
  agentName: "mcp-test-agent",
})

const execute = (source: Parameters<typeof toolExecutorLayer>[0], name: string, params: unknown) =>
  ToolExecutor.ToolExecutor.use((executor) => executor.execute(request(name, params))).pipe(
    Effect.provide(toolExecutorLayer(source)),
  )

describe("baton adapter", () => {
  it.effect("exposes discovered tools as a toolkit", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const kit = yield* toolkit(source)
        expect(Object.keys(kit.tools).toSorted()).toEqual(["calc_add", "calc_boom", "calc_stats"])
      }),
    ),
  )

  it.effect("executes tool calls against the server as Success outcomes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const outcome = yield* execute(source, "calc_add", { a: 40, b: 2 })

        expect(outcome._tag).toBe("Success")
        if (outcome._tag !== "Success") return yield* Effect.die("expected Success")
        expect(outcome.result).toBe("42")
        expect(outcome.encodedResult).toBe("42")
      }),
    ),
  )

  it.effect("maps McpToolCallError to a Failure outcome (never Suspend)", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const outcome = yield* execute(source, "calc_boom", {})

        expect(outcome._tag).toBe("Failure")
        if (outcome._tag !== "Failure") return yield* Effect.die("expected Failure")
        expect(outcome.message).toContain("boom failed")
      }),
    ),
  )

  it.effect("returns Failure for unknown tools", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const outcome = yield* execute(source, "calc_missing", {})

        expect(outcome._tag).toBe("Failure")
        if (outcome._tag !== "Failure") return yield* Effect.die("expected Failure")
        expect(outcome.message).toBe("Tool calc_missing is not registered")
      }),
    ),
  )
})
