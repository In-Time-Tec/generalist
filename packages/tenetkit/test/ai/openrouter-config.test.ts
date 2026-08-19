import { describe, expect, it } from "@effect/vitest"
import { decodeConfig } from "../../src/ai/provider/openrouter.js"

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

  it("accepts exact routing, provider, plugin, and trace fields", () => {
    const config = {
      route: "sort" as const,
      provider: { allow_fallbacks: false, data_collection: "deny" as const, sort: "latency" as const },
      plugins: [{ id: "web" as const, engine: "exa" as const, max_results: 3 }],
      trace: { trace_id: "trace-1", span_name: "completion" },
    }
    expect(decodeConfig(config)).toEqual(config)
  })

  it("rejects unknown fields and invalid reasoning efforts", () => {
    expect(() => decodeConfig({ reasoning: { effort: "ultra" } })).toThrow()
    expect(() => decodeConfig({ route: { strategy: "fallback" } })).toThrow()
    expect(() => decodeConfig({ provider: { allow_fallbacks: "yes" } })).toThrow()
    expect(() => decodeConfig({ plugins: [{ id: "web", engine: "google" }] })).toThrow()
    expect(() => decodeConfig({ trace: { request_id: "secret" } })).toThrow()
  })

  it("rejects transport-owned request fields before transport", () => {
    let requests = 0
    const request = (config: unknown) => {
      const decoded = decodeConfig(config)
      requests += 1
      return decoded
    }

    for (const config of [
      { debug: {} },
      { debug: { echo_upstream_body: true } },
      { model: "secret-model" },
      { messages: [] },
      { response_format: { type: "json_object" } },
      { stream: true },
      { stream_options: { include_usage: true } },
      { tool_choice: "auto" },
      { tools: [] },
    ]) {
      expect(() => request(config)).toThrow()
    }
    expect(requests).toBe(0)
  })
})
