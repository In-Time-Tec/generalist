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

describe("Anthropic automatic prompt caching", () => {
  it("enables top-level cache_control by default", () => {
    expect(resolvedConfig({ model: "claude-test" })).toEqual({ cache_control: { type: "ephemeral" } })
  })
  it("adds the default when the caller config omitted it", () => {
    expect(resolvedConfig({ model: "claude-test", config: decodeConfig({ max_tokens: 1_024 }) })).toEqual({
      cache_control: { type: "ephemeral" },
      max_tokens: 1_024,
    })
  })
  it("keeps an explicit cache_control override", () => {
    expect(
      resolvedConfig({
        model: "claude-test",
        config: decodeConfig({ cache_control: { type: "ephemeral", ttl: "1h" } }),
      }),
    ).toEqual({
      cache_control: { type: "ephemeral", ttl: "1h" },
    })
  })
  it("honors an explicit null disable", () => {
    expect(resolvedConfig({ model: "claude-test", config: decodeConfig({ cache_control: null }) })).toEqual({
      cache_control: null,
    })
  })
})
