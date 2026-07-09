import { describe, expect, it } from "@effect/vitest"
import { Effect, Stream } from "effect"
import { toolkit, toolkitLayer } from "../src/baton"
import { makeFixture } from "./fixture"

const execute = (source: Parameters<typeof toolkitLayer>[0], name: string, params: unknown) =>
  Effect.gen(function* () {
    const mcpToolkit = yield* toolkit(source)
    const handled = yield* mcpToolkit.pipe(Effect.provide(toolkitLayer(source)))
    const results = yield* handled.handle(name, params).pipe(Effect.flatMap(Stream.runCollect))
    return results.at(-1)
  })

describe("baton adapter", () => {
  it.effect("exposes discovered tools as a toolkit", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const kit = yield* toolkit(source)
        expect(Object.keys(kit.tools).toSorted()).toEqual(["calc_add", "calc_boom", "calc_hang", "calc_stats"])
      }),
    ),
  )

  it.effect("executes tool calls against the server as Effect AI tool results", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const result = yield* execute(source, "calc_add", { a: 40, b: 2 })

        expect(result?.isFailure).toBe(false)
        expect(result?.result).toBe("42")
        expect(result?.encodedResult).toBe("42")
      }),
    ),
  )

  it.effect("maps McpToolCallError to a returned tool failure", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const result = yield* execute(source, "calc_boom", {})

        expect(result?.isFailure).toBe(true)
        expect(result?.result).toContain("boom failed")
      }),
    ),
  )
})
