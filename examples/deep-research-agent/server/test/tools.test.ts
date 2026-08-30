import { describe, expect, it as standalone, layer as layerHost } from "@effect/vitest"
import { ConfigProvider, Effect, Fiber, Layer, SchemaAST, Stream } from "effect"
import { TestClock } from "effect/testing"
import { toolkit, toolkitLayer, webSearchTool } from "../src/tools"
import { cannedResultsFor, layer, testLayer } from "../src/web-search"

const withEnv = (env: Record<string, string>) => ConfigProvider.layer(ConfigProvider.fromUnknown(env))

const runWebSearch = (query: string) =>
  Effect.gen(function* () {
    const handledToolkit = yield* toolkit
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
  layerHost(
    Layer.provideMerge(
      toolkitLayer,
      testLayer({
        search: () =>
          Effect.succeed([{ title: "Injected", url: "https://example.test", snippet: "from fake provider" }]),
      }),
    ),
  )("returns results from an injected WebSearch", (it) => {
    it.effect("returns results from an injected WebSearch", () =>
      Effect.gen(function* () {
        const output = yield* runWebSearch("anything")

        expect(output).toEqual({
          results: [{ title: "Injected", url: "https://example.test", snippet: "from fake provider" }],
        })
      }),
    )
  })

  layerHost(Layer.provideMerge(toolkitLayer, layer.pipe(Layer.provide(withEnv({})))))(
    "uses the canned search path when no EXA_API_KEY is configured",
    (it) => {
      it.effect("uses the canned search path when no EXA_API_KEY is configured", () =>
        Effect.gen(function* () {
          const output = yield* runWebSearch("tenetkit agent framework")

          expect(output).toEqual({ results: cannedResultsFor("tenetkit agent framework") })
        }),
      )
    },
  )

  standalone("keeps a concrete model-facing parameters schema", () => {
    expect(SchemaAST.isUnknown(webSearchTool.parametersSchema.ast)).toBe(false)
  })
})
