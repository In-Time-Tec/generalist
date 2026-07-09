import { describe, expect, it } from "@effect/vitest"
import { ConfigProvider, Effect, Fiber, SchemaAST, Stream } from "effect"
import { TestClock } from "effect/testing"
import { cannedResultsFor, layer, testLayer } from "../src/search-provider"
import { toolkit, toolkitLayer, webSearchTool } from "../src/tools"

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const runWebSearch = (query: string) =>
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit.pipe(Effect.provide(toolkitLayer))
    const fiber = yield* handledToolkit.handle("web_search", { query }).pipe(
      Effect.flatMap(Stream.runCollect),
      Effect.map((chunk) => [...chunk]),
      Effect.forkChild,
    )
    yield* TestClock.adjust("600 millis")
    const outputs = yield* Fiber.join(fiber)
    return outputs.at(-1)?.result
  })

describe("web_search tool", () => {
  it.effect("returns results from an injected SearchProvider", () =>
    Effect.gen(function* () {
      const output = yield* runWebSearch("anything").pipe(
        Effect.provide(
          testLayer({
            search: () =>
              Effect.succeed([{ title: "Injected", url: "https://example.test", snippet: "from fake provider" }]),
          }),
        ),
      )

      expect(output).toEqual({
        results: [{ title: "Injected", url: "https://example.test", snippet: "from fake provider" }],
      })
    }),
  )

  it.effect("uses the canned search path when no EXA_API_KEY is configured", () =>
    Effect.gen(function* () {
      const output = yield* runWebSearch("baton agent framework").pipe(
        Effect.provide(layer),
        Effect.provide(withEnv({})),
      )

      expect(output).toEqual({ results: cannedResultsFor("baton agent framework") })
    }),
  )

  it("keeps a concrete model-facing parameters schema", () => {
    expect(SchemaAST.isUnknown(webSearchTool.parametersSchema.ast)).toBe(false)
  })
})
