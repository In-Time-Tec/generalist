import { describe, expect, it } from "@effect/vitest"
import { Generated } from "@effect/ai-anthropic"
import { decodeConfig } from "../src/provider/anthropic.js"

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
