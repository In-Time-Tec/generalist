import { expect, it, layer } from "@effect/vitest"
import { Effect, Logger, Option } from "effect"
import { Response } from "effect/unstable/ai"
import { contextWindow, cost, layerTest, type Metadata } from "../../src/ai/model-catalog.js"

const metadata: Metadata = {
  provider: "test",
  model: "small",
  contextWindow: 8_192,
  maxOutput: 1_024,
  logprobs: false,
  pricing: {
    inputPerMTok: 2,
    outputPerMTok: 8,
    cacheReadPerMTok: 1,
    cacheWritePerMTok: 3,
  },
}

const usage = Response.Usage.make({
  inputTokens: { total: 1_000, uncached: 400, cacheRead: 500, cacheWrite: 100 },
  outputTokens: { total: 200, text: 200, reasoning: undefined },
})

it.effect("uses the bundled catalog when no catalog service is provided", () =>
  Effect.gen(function* () {
    expect(yield* contextWindow({ provider: "openai", model: "gpt-4o-mini" })).toEqual(Option.some(128_000))
  }),
)

layer(layerTest([metadata]))("ModelCatalog", (suite) => {
  suite.effect("resolves context windows from a provided catalog", () =>
    Effect.gen(function* () {
      expect(yield* contextWindow({ provider: "test", model: "small" })).toEqual(Option.some(8_192))
    }),
  )

  suite.effect("prices uncached, cache, and output tokens", () =>
    Effect.gen(function* () {
      expect(yield* cost({ provider: "test", model: "small" }, usage)).toEqual(Option.some(0.0032))
      expect(yield* cost({ provider: "test", model: "unknown" }, usage)).toEqual(Option.none())
    }),
  )

  suite.effect("returns none and logs an unknown model only once", () => {
    const logs: Array<unknown> = []
    const logger = Logger.make(({ message }) => logs.push(message))
    return Effect.gen(function* () {
      const selection = { provider: "test", model: "unknown" }
      expect(yield* contextWindow(selection)).toEqual(Option.none())
      expect(yield* contextWindow(selection)).toEqual(Option.none())
      expect(logs).toHaveLength(1)
    }).pipe(Effect.provideService(Logger.CurrentLoggers, new Set([logger])))
  })
})
