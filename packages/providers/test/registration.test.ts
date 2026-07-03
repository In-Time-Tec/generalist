import { describe, expect, it } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer, Redacted } from "effect"
import * as Ai from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { anthropic } from "@batonfx/providers/anthropic"
import { withOpenAiOrDeterministic } from "@batonfx/providers/deterministic"
import { openAi, withOpenAi } from "@batonfx/providers/openai"
import { openAiCompatible, withOpenAiCompatible } from "@batonfx/providers/openai-compat"
import { openRouter } from "@batonfx/providers/openrouter"
import { Deterministic, Embedding, Presets } from "../src/index"

const apiKey = Config.succeed(Redacted.make("test-key"))

describe("providers", () => {
  it.effect("creates an OpenAI-compatible preset registration for ModelRegistry", () =>
    Effect.gen(function* () {
      const registration = yield* Presets.groq({ model: "llama-test", apiKey })

      expect(registration.provider).toBe("groq")
      expect(registration.model).toBe("llama-test")

      const registered = yield* ModelRegistry.registrations()

      expect(registered.map((item) => [item.provider, item.model])).toEqual([["groq", "llama-test"]])
    }).pipe(
      Effect.provide(ModelRegistry.layerFromRegistrationEffects([Presets.groq({ model: "llama-test", apiKey })])),
    ),
  )

  it.effect("round-trips the deterministic model through Agent.generate", () => {
    const agent = Agent.make({ name: "deterministic-agent" })
    return Effect.gen(function* () {
      const result = yield* ModelRegistry.provide(
        { provider: "deterministic", model: "local" },
        Agent.generate(agent, { prompt: "hello" }),
      )

      expect(result.text).toBe("deterministic response")
      expect(result.turns).toBe(1)
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Deterministic.withDeterministic({ model: "local" }),
          ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it.effect("keeps the deterministic fallback when OpenAI config is missing", () => {
    const agent = Agent.make({ name: "fallback-agent" })
    return Effect.gen(function* () {
      const registered = yield* ModelRegistry.registrations()
      const result = yield* ModelRegistry.provide(
        { provider: "deterministic", model: "fallback" },
        Agent.generate(agent, { prompt: "hello" }),
      )

      expect(registered.map((item) => [item.provider, item.model])).toEqual([["deterministic", "fallback"]])
      expect(result.text).toBe("deterministic response")
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Deterministic.withOpenAiOrDeterministic({
            model: "gpt-test",
            fallbackModel: "fallback",
            apiKey: Config.fail(new ConfigProvider.SourceError({ message: "missing test key" })),
          }),
          ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
          Approvals.autoApprove,
          ModelMiddleware.identityLayer,
        ),
      ),
    )
  })

  it("builds embedding layers without live calls", () => {
    const openAiLayer: Layer.Layer<Ai.EmbeddingModel.EmbeddingModel, Config.ConfigError> =
      Embedding.withOpenAiEmbedding({ model: "text-embedding-3-small", apiKey })
    const compatibleLayer: Layer.Layer<Ai.EmbeddingModel.EmbeddingModel, Config.ConfigError> =
      Embedding.withOpenAiCompatibleEmbedding({ model: "embed-test", baseUrl: "http://localhost:11434/v1", apiKey })

    expect(openAiLayer).toBeDefined()
    expect(compatibleLayer).toBeDefined()
  })

  it("exposes provider helper functions and subpath modules", () => {
    expect(typeof openAi).toBe("function")
    expect(typeof anthropic).toBe("function")
    expect(typeof openRouter).toBe("function")
    expect(typeof openAiCompatible).toBe("function")
    expect(typeof withOpenAi).toBe("function")
    expect(typeof withOpenAiCompatible).toBe("function")
    expect(typeof withOpenAiOrDeterministic).toBe("function")
    expect(typeof Presets.withAzureOpenAi).toBe("function")
    expect(typeof Presets.withOllama).toBe("function")
  })
})
