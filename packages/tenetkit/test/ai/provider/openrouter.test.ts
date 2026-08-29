import "./suites/openrouter-stream-error-suite.js"
import { describe, expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { HttpClient } from "effect/unstable/http"
import { ModelRegistry } from "tenetkit"
import { decodeConfig, layer } from "../../../src/ai/provider/openrouter.js"

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T

describe("OpenRouter request configuration", () => {
  it("excludes transport-owned debug from the public configuration type", () => {
    type PublicConfig = NonNullable<Parameters<typeof layer>[0]["config"]>
    const excludesDebug: Assert<Equal<"debug" extends keyof PublicConfig ? true : false, false>> = true
    expect(excludesDebug).toBe(true)
  })

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
    type RejectedConfig = Parameters<typeof decodeConfig>[0]
    const request = (config: RejectedConfig) => {
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

  it.effect("rejects a runtime debug bypass in the real provider layer before HttpClient", () => {
    let requests = 0
    const client = HttpClient.make(() => {
      requests += 1
      return Effect.die("invalid OpenRouter configuration reached transport")
    })
    const invalidConfig = { temperature: 0, debug: { echo_upstream_body: true } }
    const invalidLayer = layer({
      model: "router-test",
      apiKey: Config.succeed(Redacted.make("test-key")),
      config: invalidConfig,
    }).pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, client)))

    return Effect.gen(function* () {
      const operation = ModelRegistry.withModel(
        { provider: "openrouter", model: "router-test" },
        LanguageModel.generateText({ prompt: "must not be sent" }),
      )
      const exit = yield* Effect.scoped(
        Effect.flatMap(Layer.build(invalidLayer), (context) => Effect.provide(operation, context)),
      ).pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      expect(requests).toBe(0)
    })
  })
})
