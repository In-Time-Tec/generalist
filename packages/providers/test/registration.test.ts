import { describe, expect, it, layer as testLayer } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer, Redacted, Schema } from "effect"
import { EmbeddingModel, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { anthropic, withAnthropic } from "@batonfx/providers/anthropic"
import { withOpenAiOrDeterministic } from "@batonfx/providers/deterministic"
import { openAi, withOpenAi } from "@batonfx/providers/openai"
import { openAiCompatible, withOpenAiCompatible } from "@batonfx/providers/openai-compat"
import { openRouter, withOpenRouter } from "@batonfx/providers/openrouter"
import { Deterministic, Embedding, Presets } from "../src/index"

const apiKey = Config.succeed(Redacted.make("test-key"))
const unexpectedTool = Tool.make("unexpected", { parameters: Schema.Unknown, success: Schema.Unknown })
const unexpectedToolkit = Toolkit.make(unexpectedTool)
const unexpectedToolLayer = unexpectedToolkit.toLayer({
  unexpected: () => Effect.die("unexpected tool call"),
})

describe("providers", () => {
  testLayer(ModelRegistry.layerFromRegistrationEffects([Presets.groq({ model: "llama-test", apiKey })]))((test) => {
    test.effect("creates an OpenAI-compatible preset registration for ModelRegistry", () =>
      Effect.gen(function* () {
        const registration = yield* Presets.groq({ model: "llama-test", apiKey })

        expect(registration.provider).toBe("groq")
        expect(registration.model).toBe("llama-test")

        const registered = yield* ModelRegistry.registrations()

        expect(registered.map((item) => [item.provider, item.model])).toEqual([["groq", "llama-test"]])
      }),
    )
  })

  testLayer(
    Layer.mergeAll(
      Deterministic.withDeterministic({ model: "local" }),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("round-trips the deterministic model through Agent.generate", () => {
      const agent = Agent.make("deterministic-agent", { toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const result = yield* ModelRegistry.provide(
          { provider: "deterministic", model: "local" },
          Agent.generate({ prompt: "hello" })(agent),
        )

        expect(result.text).toBe("deterministic response")
        expect(result.turns).toBe(1)
      })
    })
  })

  testLayer(
    Layer.mergeAll(
      Deterministic.withOpenAiOrDeterministic({
        model: "gpt-test",
        fallbackModel: "fallback",
        apiKey: Config.fail(new ConfigProvider.SourceError({ message: "missing test key" })),
      }),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("keeps the deterministic fallback when OpenAI config is missing", () => {
      const agent = Agent.make("fallback-agent", { toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const registered = yield* ModelRegistry.registrations()
        const result = yield* ModelRegistry.provide(
          { provider: "deterministic", model: "fallback" },
          Agent.generate({ prompt: "hello" })(agent),
        )

        expect(registered.map((item) => [item.provider, item.model])).toEqual([["deterministic", "fallback"]])
        expect(result.text).toBe("deterministic response")
      })
    })
  })

  testLayer(
    Layer.mergeAll(
      ModelRegistry.combine([
        Deterministic.withDeterministic({ provider: "det-a", model: "model-a" }),
        Deterministic.withDeterministic({ provider: "det-b", model: "model-b" }),
      ]),
      ToolExecutor.testLayer({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.autoApprove,
      ModelMiddleware.identityLayer,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("combines two withProvider layers so models from both resolve", () => {
      const agent = Agent.make("combined-agent", { toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const registered = yield* ModelRegistry.registrations()
        expect(registered.map((item) => [item.provider, item.model])).toEqual([
          ["det-a", "model-a"],
          ["det-b", "model-b"],
        ])

        const first = yield* ModelRegistry.provide(
          { provider: "det-a", model: "model-a" },
          Agent.generate({ prompt: "hello" })(agent),
        )
        const second = yield* ModelRegistry.provide(
          { provider: "det-b", model: "model-b" },
          Agent.generate({ prompt: "hello" })(agent),
        )
        expect(first.text).toBe("deterministic response")
        expect(second.text).toBe("deterministic response")
      })
    })
  })

  testLayer(
    ModelRegistry.combine([
      withAnthropic({ model: "claude-test", apiKey }),
      withOpenRouter({ model: "openrouter-test", apiKey }),
    ]),
  )((test) => {
    test.effect("combines anthropic and openrouter registry layers without dropping registrations", () =>
      Effect.gen(function* () {
        const registered = yield* ModelRegistry.registrations()

        expect(registered.map((item) => [item.provider, item.model])).toEqual([
          ["anthropic", "claude-test"],
          ["openrouter", "openrouter-test"],
        ])
      }),
    )
  })

  it("builds embedding layers without live calls", () => {
    const openAiLayer: Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError> = Embedding.withOpenAiEmbedding({
      model: "text-embedding-3-small",
      apiKey,
    })
    const compatibleLayer: Layer.Layer<EmbeddingModel.EmbeddingModel, Config.ConfigError> =
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
