import "./suites/anthropic-stream-error-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Generated } from "@effect/ai-anthropic"
import { Effect, Schema } from "effect"
import { decodeConfig, resolvedConfig } from "../../../src/ai/provider/anthropic.js"

describe("Anthropic request configuration", () => {
  it.effect("accepts every effort level the Messages API declares and rejects unknown levels", () =>
    Effect.gen(function* () {
      for (const effort of Generated.BetaEffortLevel.literals) {
        expect(yield* decodeConfig({ output_config: { effort }, max_tokens: 1_024 })).toEqual({
          output_config: { effort },
          max_tokens: 1_024,
        })
      }
      expect(Schema.isSchemaError(yield* Effect.flip(decodeConfig({ output_config: { effort: "xhigh" } })))).toBe(true)
    }),
  )
})

describe("Anthropic automatic prompt caching opt-in", () => {
  it("leaves the request config untouched when the caller set none", () => {
    expect(resolvedConfig({ model: "claude-test" })).toEqual({})
  })
  it.effect("keeps an explicit cache_control opt-in", () =>
    Effect.gen(function* () {
      expect(
        resolvedConfig({
          model: "claude-test",
          config: yield* decodeConfig({ cache_control: { type: "ephemeral", ttl: "1h" } }),
        }),
      ).toEqual({
        cache_control: { type: "ephemeral", ttl: "1h" },
      })
    }),
  )
  it.effect("honors an explicit null disable", () =>
    Effect.gen(function* () {
      expect(resolvedConfig({ model: "claude-test", config: yield* decodeConfig({ cache_control: null }) })).toEqual({
        cache_control: null,
      })
    }),
  )
})
