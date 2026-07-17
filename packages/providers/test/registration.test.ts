import { describe, expect, it, layer as testLayer } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer, Redacted, Ref, Schema } from "effect"
import { AiError, Tool, Toolkit } from "effect/unstable/ai"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import {
  anthropic,
  classifyFailure as classifyAnthropicFailure,
  withAnthropic,
  withAnthropicFetch,
} from "@batonfx/providers/anthropic"
import { withOpenAiOrDeterministic, withOpenAiOrDeterministicFetch } from "@batonfx/providers/deterministic"
import {
  classifyFailure as classifyOpenAiFailure,
  openAi,
  withOpenAi,
  withOpenAiFetch,
} from "@batonfx/providers/openai"
import { openAiCompatible, withOpenAiCompatible, withOpenAiCompatibleFetch } from "@batonfx/providers/openai-compat"
import {
  classifyFailure as classifyOpenRouterFailure,
  openRouter,
  withOpenRouter,
  withOpenRouterFetch,
} from "@batonfx/providers/openrouter"
import { Deterministic, Embedding, Presets } from "../src/index.js"

const apiKey = Config.succeed(Redacted.make("test-key"))
const unexpectedTool = Tool.make("unexpected", { parameters: Schema.Unknown, success: Schema.Unknown })
const unexpectedToolkit = Toolkit.make(unexpectedTool)
const unexpectedToolLayer = unexpectedToolkit.toLayer({
  unexpected: () => Effect.die("unexpected tool call"),
})
const hostHttpClient = HttpClient.make(() => Effect.die("unexpected HTTP request"))

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Assert<T extends true> = T
type EveryLayerServices<Layers extends ReadonlyArray<Layer.Any>, Services> = Layers extends readonly [
  infer Head extends Layer.Any,
  ...infer Tail extends ReadonlyArray<Layer.Any>,
]
  ? Equal<Layer.Services<Head>, Services> extends true
    ? EveryLayerServices<Tail, Services>
    : false
  : true
type EveryLayerError<Layers extends ReadonlyArray<Layer.Any>, Error> = Layers extends readonly [
  infer Head extends Layer.Any,
  ...infer Tail extends ReadonlyArray<Layer.Any>,
]
  ? Equal<Layer.Error<Head>, Error> extends true
    ? EveryLayerError<Tail, Error>
    : false
  : true
type EveryEffectServices<Effects extends ReadonlyArray<unknown>, Services> = Effects extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Equal<Effect.Services<Head>, Services> extends true
    ? EveryEffectServices<Tail, Services>
    : false
  : true
type EveryEffectError<Effects extends ReadonlyArray<unknown>, Error> = Effects extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Equal<Effect.Error<Head>, Error> extends true
    ? EveryEffectError<Tail, Error>
    : false
  : true

const tuple = <const Values extends ReadonlyArray<unknown>>(...values: Values): Values => values

describe("providers", () => {
  it("classifies provider context failures from structured metadata and narrow messages", () => {
    const openAiStructured = AiError.make({
      module: "OpenAiClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({
        description: "unrelated wording",
        metadata: {
          openai: { errorCode: "context_length_exceeded", errorType: "invalid_request_error", requestId: null },
        },
      }),
    })
    const openAiMessage = AiError.make({
      module: "OpenAiClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({ description: "This model's maximum context length is 128000 tokens" }),
    })
    const anthropicPrompt = AiError.make({
      module: "AnthropicClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({
        description: "prompt is too long: 210000 tokens > 200000 maximum",
        metadata: { anthropic: { errorType: "invalid_request_error", requestId: null } },
      }),
    })
    const openRouterUpstream = AiError.make({
      module: "OpenRouterClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({
        description: "upstream rejected request",
        metadata: {
          openrouter: { errorCode: "context_window_exceeded", errorType: "invalid_request_error", requestId: null },
        },
      }),
    })
    const openRouterAnthropicUpstream = AiError.make({
      module: "OpenRouterClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({
        description: "prompt is too long: 210000 tokens > 200000 maximum",
        metadata: { openrouter: { errorCode: 400, errorType: null, requestId: null } },
      }),
    })

    expect(classifyOpenAiFailure(openAiStructured)).toBe("context-overflow")
    expect(classifyOpenAiFailure(openAiMessage)).toBe("context-overflow")
    expect(classifyAnthropicFailure(anthropicPrompt)).toBe("context-overflow")
    expect(classifyOpenRouterFailure(openRouterUpstream)).toBe("context-overflow")
    expect(classifyOpenRouterFailure(openRouterAnthropicUpstream)).toBe("context-overflow")
  })

  it.effect("rejects provider false positives and keeps compatible endpoints conservative by default", () => {
    const maximumOutput = AiError.make({
      module: "OpenAiClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({ description: "maximum output token length exceeded" }),
    })
    const rateLimit = AiError.make({
      module: "OpenAiClient",
      method: "stream",
      reason: AiError.RateLimitError.make({
        metadata: {
          openai: {
            errorCode: "context_length_exceeded",
            errorType: "rate_limit_error",
            requestId: null,
            limit: null,
            remaining: null,
            resetRequests: null,
            resetTokens: null,
          },
        },
      }),
    })
    const anthropicBytes = AiError.make({
      module: "AnthropicClient",
      method: "stream",
      reason: AiError.UnknownError.make({
        description: "request body exceeds maximum allowed bytes",
        metadata: { anthropic: { errorType: "request_too_large", requestId: null } },
      }),
    })

    expect(classifyOpenAiFailure(maximumOutput)).toBe("other")
    expect(classifyOpenAiFailure(rateLimit)).toBe("other")
    expect(classifyAnthropicFailure(anthropicBytes)).toBe("other")
    expect(classifyOpenRouterFailure(maximumOutput)).toBe("other")

    const contextOverflow = AiError.make({
      module: "OpenAiClient",
      method: "stream",
      reason: AiError.InvalidRequestError.make({
        metadata: {
          openai: { errorCode: "context_length_exceeded", errorType: "invalid_request_error", requestId: null },
        },
      }),
    })
    const registrations = (classifyFailure?: ModelRegistry.FailureClassifier) =>
      Effect.scoped(
        Layer.build(
          withOpenAiCompatible({
            model: classifyFailure === undefined ? "compatible-default" : "compatible-openai",
            apiKey,
            ...(classifyFailure === undefined ? {} : { classifyFailure }),
          }),
        ).pipe(Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context)))),
      )
    return Effect.all([registrations(), registrations(classifyOpenAiFailure)]).pipe(
      Effect.map(([defaultRegistrations, optedInRegistrations]) => {
        const defaultRegistration = defaultRegistrations[0]!
        const optedInRegistration = optedInRegistrations[0]!
        expect(defaultRegistration.classifyFailure).toBeUndefined()
        expect(optedInRegistration.classifyFailure?.(maximumOutput)).toBe("other")
        expect(optedInRegistration.classifyFailure?.(contextOverflow)).toBe("context-overflow")
      }),
      Effect.provideService(HttpClient.HttpClient, hostHttpClient),
    )
  })

  testLayer(ModelRegistry.layerFromRegistrationEffects([Presets.groqFetch({ model: "llama-test", apiKey })]))(
    (test) => {
      test.effect("creates an OpenAI-compatible preset registration for ModelRegistry", () =>
        Effect.gen(function* () {
          const registration = yield* Presets.groqFetch({ model: "llama-test", apiKey })

          expect(registration.provider).toBe("groq")
          expect(registration.model).toBe("llama-test")

          const registered = yield* ModelRegistry.registrations()

          expect(registered.map((item) => [item.provider, item.model])).toEqual([["groq", "llama-test"]])
        }),
      )
    },
  )

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

  it.effect("propagates an OpenAI configuration source failure instead of selecting the fallback", () => {
    const sourceFailure = new ConfigProvider.SourceError({ message: "test config source unavailable" })

    return Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(
            Deterministic.withOpenAiOrDeterministicFetch({
              model: "gpt-test",
              fallbackModel: "fallback",
              apiKey: Config.redacted("OPENAI_API_KEY"),
            }),
          ),
        ),
      )

      expect(failure._tag).toBe("ConfigError")
      expect(failure.cause._tag).toBe("SourceError")
      if (failure.cause._tag === "SourceError") {
        expect(failure.cause.message).toBe("test config source unavailable")
      }
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.make(() => Effect.fail(sourceFailure)),
      ),
    )
  })

  it.effect("propagates an OpenAI client configuration failure instead of selecting the fallback", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(
            Deterministic.withOpenAiOrDeterministicFetch({
              model: "gpt-test",
              fallbackModel: "fallback",
              apiKey,
              clientConfig: {
                apiUrl: Config.fail(
                  new ConfigProvider.SourceError({ message: "test client configuration unavailable" }),
                ),
              },
            }),
          ),
        ),
      )

      expect(failure._tag).toBe("ConfigError")
      expect(failure.cause._tag).toBe("SourceError")
      if (failure.cause._tag === "SourceError") {
        expect(failure.cause.message).toBe("test client configuration unavailable")
      }
    }),
  )

  it.effect("selects deterministic-only registration concurrently when OpenAI configuration is absent", () => {
    const fallbackLayer = Deterministic.withOpenAiOrDeterministicFetch({
      model: "gpt-test",
      fallbackModel: "fallback",
      apiKey: Config.redacted("OPENAI_API_KEY"),
    })
    const registrations = Effect.scoped(
      Layer.build(fallbackLayer).pipe(
        Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context))),
      ),
    )

    return Effect.gen(function* () {
      const results = yield* Effect.all([registrations, registrations], { concurrency: 2 })

      expect(results.map((items) => items.map((item) => [item.provider, item.model]))).toEqual([
        [["deterministic", "fallback"]],
        [["deterministic", "fallback"]],
      ])
    }).pipe(Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})))
  })

  it.effect("propagates malformed OpenAI configuration instead of selecting the fallback", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(
            Deterministic.withOpenAiOrDeterministicFetch({
              model: "gpt-test",
              fallbackModel: "fallback",
              apiKey: Config.finite("OPENAI_API_KEY").pipe(Config.map((value) => Redacted.make(String(value)))),
            }),
          ),
        ),
      )

      expect(failure._tag).toBe("ConfigError")
      expect(failure.cause._tag).toBe("SchemaError")
    }).pipe(
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ OPENAI_API_KEY: "not-a-number" }),
      ),
    ),
  )

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
      withAnthropicFetch({ model: "claude-test", apiKey }),
      withOpenRouterFetch({ model: "openrouter-test", apiKey }),
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
    const baseLayers = tuple(
      Embedding.withOpenAiEmbedding({ model: "text-embedding-3-small", apiKey }),
      Embedding.withOpenAiCompatibleEmbedding({
        model: "embed-test",
        baseUrl: "http://localhost:11434/v1",
        apiKey,
      }),
    )
    const fetchLayers = tuple(
      Embedding.withOpenAiEmbeddingFetch({ model: "text-embedding-3-small", apiKey }),
      Embedding.withOpenAiCompatibleEmbeddingFetch({
        model: "embed-test",
        baseUrl: "http://localhost:11434/v1",
        apiKey,
      }),
    )
    const baseRequirements: Assert<EveryLayerServices<typeof baseLayers, HttpClient.HttpClient>> = true
    const fetchRequirements: Assert<EveryLayerServices<typeof fetchLayers, never>> = true
    const baseErrors: Assert<EveryLayerError<typeof baseLayers, Config.ConfigError>> = true
    const fetchErrors: Assert<EveryLayerError<typeof fetchLayers, Config.ConfigError>> = true

    expect([baseRequirements, fetchRequirements, baseErrors, fetchErrors]).toEqual([true, true, true, true])
  })

  it("preserves HttpClient in base layer requirements and discharges it only in Fetch conveniences", () => {
    const baseLayers = tuple(
      withOpenAi({ model: "gpt-test", apiKey }),
      withAnthropic({ model: "claude-test", apiKey }),
      withOpenRouter({ model: "openrouter-test", apiKey }),
      withOpenAiCompatible({ model: "compatible-test", apiKey }),
      Presets.withGroq({ model: "model", apiKey }),
      Presets.withMistral({ model: "model", apiKey }),
      Presets.withXai({ model: "model", apiKey }),
      Presets.withDeepseek({ model: "model", apiKey }),
      Presets.withGoogleAiStudio({ model: "model", apiKey }),
      Presets.withAzureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.withOllama({ model: "model", apiKey }),
    )
    const fetchLayers = tuple(
      withOpenAiFetch({ model: "gpt-test", apiKey }),
      withAnthropicFetch({ model: "claude-test", apiKey }),
      withOpenRouterFetch({ model: "openrouter-test", apiKey }),
      withOpenAiCompatibleFetch({ model: "compatible-test", apiKey }),
      Presets.withGroqFetch({ model: "model", apiKey }),
      Presets.withMistralFetch({ model: "model", apiKey }),
      Presets.withXaiFetch({ model: "model", apiKey }),
      Presets.withDeepseekFetch({ model: "model", apiKey }),
      Presets.withGoogleAiStudioFetch({ model: "model", apiKey }),
      Presets.withAzureOpenAiFetch({ model: "model", resource: "resource", apiKey }),
      Presets.withOllamaFetch({ model: "model", apiKey }),
    )
    const deterministicLayer = withOpenAiOrDeterministic({ model: "gpt-test", fallbackModel: "fallback", apiKey })
    const deterministicFetchLayer = withOpenAiOrDeterministicFetch({
      model: "gpt-test",
      fallbackModel: "fallback",
      apiKey,
    })
    const baseRequirements: Assert<EveryLayerServices<typeof baseLayers, HttpClient.HttpClient>> = true
    const fetchRequirements: Assert<EveryLayerServices<typeof fetchLayers, never>> = true
    const errors: Assert<EveryLayerError<typeof baseLayers, Config.ConfigError>> = true
    const fetchErrors: Assert<EveryLayerError<typeof fetchLayers, Config.ConfigError>> = true
    const deterministicRequirements: Assert<Equal<Layer.Services<typeof deterministicLayer>, HttpClient.HttpClient>> =
      true
    const deterministicFetchRequirements: Assert<Equal<Layer.Services<typeof deterministicFetchLayer>, never>> = true
    const deterministicErrors: Assert<Equal<Layer.Error<typeof deterministicLayer>, Config.ConfigError>> = true
    const deterministicFetchErrors: Assert<Equal<Layer.Error<typeof deterministicFetchLayer>, Config.ConfigError>> =
      true
    const basePresets = tuple(
      Presets.groq({ model: "model", apiKey }),
      Presets.mistral({ model: "model", apiKey }),
      Presets.xai({ model: "model", apiKey }),
      Presets.deepseek({ model: "model", apiKey }),
      Presets.googleAiStudio({ model: "model", apiKey }),
      Presets.azureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.ollama({ model: "model", apiKey }),
    )
    const fetchPresets = tuple(
      Presets.groqFetch({ model: "model", apiKey }),
      Presets.mistralFetch({ model: "model", apiKey }),
      Presets.xaiFetch({ model: "model", apiKey }),
      Presets.deepseekFetch({ model: "model", apiKey }),
      Presets.googleAiStudioFetch({ model: "model", apiKey }),
      Presets.azureOpenAiFetch({ model: "model", resource: "resource", apiKey }),
      Presets.ollamaFetch({ model: "model", apiKey }),
    )
    const basePresetRequirements: Assert<EveryEffectServices<typeof basePresets, HttpClient.HttpClient>> = true
    const fetchPresetRequirements: Assert<EveryEffectServices<typeof fetchPresets, never>> = true
    const presetErrors: Assert<EveryEffectError<typeof basePresets, Config.ConfigError>> = true
    const fetchPresetErrors: Assert<EveryEffectError<typeof fetchPresets, Config.ConfigError>> = true

    expect([
      baseRequirements,
      fetchRequirements,
      errors,
      fetchErrors,
      deterministicRequirements,
      deterministicFetchRequirements,
      deterministicErrors,
      deterministicFetchErrors,
      basePresetRequirements,
      fetchPresetRequirements,
      presetErrors,
      fetchPresetErrors,
    ]).toEqual([true, true, true, true, true, true, true, true, true, true, true, true])
  })

  it.effect("builds base provider and preset constructors concurrently with the host HttpClient", () => {
    const providerLayers = [
      withOpenAi({ model: "gpt-test", apiKey }),
      withAnthropic({ model: "claude-test", apiKey }),
      withOpenRouter({ model: "openrouter-test", apiKey }),
      withOpenAiCompatible({ model: "compatible-test", apiKey }),
      Presets.withGroq({ model: "model", apiKey }),
      Presets.withMistral({ model: "model", apiKey }),
      Presets.withXai({ model: "model", apiKey }),
      Presets.withDeepseek({ model: "model", apiKey }),
      Presets.withGoogleAiStudio({ model: "model", apiKey }),
      Presets.withAzureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.withOllama({ model: "model", apiKey }),
    ]
    const embeddingLayers = [
      Embedding.withOpenAiEmbedding({ model: "text-embedding-3-small", apiKey }),
      Embedding.withOpenAiCompatibleEmbedding({
        model: "embed-test",
        baseUrl: "http://localhost:11434/v1",
        apiKey,
      }),
    ]

    return Effect.all(
      [
        Effect.all(
          providerLayers.map((layer) => Effect.scoped(Layer.build(layer)).pipe(Effect.asVoid)),
          { concurrency: 4 },
        ),
        Effect.all(
          embeddingLayers.map((layer) => Effect.scoped(Layer.build(layer)).pipe(Effect.asVoid)),
          { concurrency: 2 },
        ),
      ],
      { concurrency: 2 },
    ).pipe(Effect.provideService(HttpClient.HttpClient, hostHttpClient))
  })

  it.effect("builds the base deterministic fallback with the host HttpClient", () =>
    Effect.gen(function* () {
      const apiKeyReads = yield* Ref.make(0)
      const countedApiKey = apiKey.pipe(
        Config.mapOrFail((value) => Ref.updateAndGet(apiKeyReads, (count) => count + 1).pipe(Effect.as(value))),
      )
      const registered = yield* Effect.scoped(
        Layer.build(
          withOpenAiOrDeterministic({
            model: "gpt-test",
            fallbackModel: "fallback",
            apiKey: countedApiKey,
          }),
        ).pipe(Effect.flatMap((context) => ModelRegistry.registrations().pipe(Effect.provide(context)))),
      )

      expect(registered.map((item) => [item.provider, item.model])).toEqual([
        ["deterministic", "fallback"],
        ["openai", "gpt-test"],
      ])
      expect(yield* Ref.get(apiKeyReads)).toBe(1)
    }).pipe(Effect.provideService(HttpClient.HttpClient, hostHttpClient)),
  )

  it.effect("keeps provider configuration failures typed when a host HttpClient is supplied", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(
            withOpenAi({
              model: "gpt-test",
              apiKey: Config.fail(new ConfigProvider.SourceError({ message: "missing test key" })),
            }),
          ),
        ),
      )

      expect(failure._tag).toBe("ConfigError")
    }).pipe(Effect.provideService(HttpClient.HttpClient, hostHttpClient)),
  )

  it("exposes provider helper functions and subpath modules", () => {
    expect(typeof openAi).toBe("function")
    expect(typeof anthropic).toBe("function")
    expect(typeof openRouter).toBe("function")
    expect(typeof openAiCompatible).toBe("function")
    expect(typeof withOpenAi).toBe("function")
    expect(typeof withOpenAiFetch).toBe("function")
    expect(typeof withOpenAiCompatible).toBe("function")
    expect(typeof withOpenAiCompatibleFetch).toBe("function")
    expect(typeof withOpenAiOrDeterministic).toBe("function")
    expect(typeof withOpenAiOrDeterministicFetch).toBe("function")
    expect(typeof Presets.withAzureOpenAi).toBe("function")
    expect(typeof Presets.withAzureOpenAiFetch).toBe("function")
    expect(typeof Presets.withOllama).toBe("function")
    expect(typeof Presets.withOllamaFetch).toBe("function")
    expect(FetchHttpClient.layer).toBeDefined()
  })
})
