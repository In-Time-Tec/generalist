import { describe, expect, it } from "@effect/vitest"
import { Generated } from "@effect/ai-anthropic"
import { decodeConfig, resolvedConfig } from "../src/provider/anthropic.js"

describe("Anthropic request configuration", () => {
  it("accepts every effort level the Messages API declares and rejects unknown levels", () => {
    for (const effort of Generated.BetaEffortLevel.literals) {
      expect(decodeConfig({ output_config: { effort }, max_tokens: 1_024 })).toEqual({
        output_config: { effort },
        max_tokens: 1_024,
      })
    }
    expect(() => decodeConfig({ output_config: { effort: "xhigh" } })).toThrow()
  })
})

describe("Anthropic automatic prompt caching opt-in", () => {
  it("leaves the request config untouched when the caller set none", () => {
    expect(resolvedConfig({ model: "claude-test" })).toEqual({})
  })
  it("keeps an explicit cache_control opt-in", () => {
    expect(resolvedConfig({ model: "claude-test", config: decodeConfig({ cache_control: { type: "ephemeral", ttl: "1h" } }) })).toEqual({
      cache_control: { type: "ephemeral", ttl: "1h" },
    })
  })
  it("honors an explicit null disable", () => {
    expect(resolvedConfig({ model: "claude-test", config: decodeConfig({ cache_control: null }) })).toEqual({
      cache_control: null,
    })
  })
})
