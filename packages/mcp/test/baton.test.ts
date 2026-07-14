import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { toolkit, toolkitLayer } from "../src/baton"
import { makeFixture } from "./fixture"

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

  it.effect("builds handlers that proxy tool calls to the server", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const handlers = yield* Layer.build(toolkitLayer(source))
        expect(handlers).toBeDefined()
        expect(yield* source.callTool("add", { a: 40, b: 2 })).toBe("42")
      }),
    ),
  )

  it.effect("builds handlers for failing server tools", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const { source } = yield* makeFixture
        const handlers = yield* Layer.build(toolkitLayer(source))
        expect(handlers).toBeDefined()
        const error = yield* Effect.flip(source.callTool("boom", {}))
        expect(error.message).toContain("boom failed")
      }),
    ),
  )
})
