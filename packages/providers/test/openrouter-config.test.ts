import { describe, expect, it } from "@effect/vitest"
import { decodeConfig } from "../src/provider/openrouter.js"

describe("OpenRouter request configuration", () => {
  it("accepts every reasoning effort and summary verbosity OpenRouter declares", () => {
    for (const effort of ["xhigh", "high", "medium", "low", "minimal", "none"] as const) {
      for (const summary of ["auto", "concise", "detailed"] as const) {
        expect(decodeConfig({ reasoning: { effort, summary } })).toEqual({ reasoning: { effort, summary } })
      }
    }
  })

  it("accepts common chat completion parameters", () => {
    expect(
      decodeConfig({
        reasoning: { effort: "high" },
        max_tokens: 16_384,
        temperature: 0.2,
        top_p: 1,
        stop: ["END"],
      }),
    ).toEqual({ reasoning: { effort: "high" }, max_tokens: 16_384, temperature: 0.2, top_p: 1, stop: ["END"] })
  })

  it("rejects unknown fields and invalid reasoning efforts", () => {
    expect(() => decodeConfig({ service_tier: "priority" })).toThrow()
    expect(() => decodeConfig({ reasoning: { effort: "ultra" } })).toThrow()
  })
})
