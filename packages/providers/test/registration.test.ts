import { describe, expect, it, layer as testLayer } from "@effect/vitest"
import { Config, ConfigProvider, Effect, Layer, Redacted, Ref, Schema } from "effect"
import { AiError, Tool, Toolkit } from "effect/unstable/ai"
import { FetchHttpClient, HttpClient } from "effect/unstable/http"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "@batonfx/core"
import { classifyFailure as classifyAnthropicFailure, layer as anthropicLayer } from "@batonfx/providers/anthropic"
import { layerOpenAi as deterministicLayerOpenAi } from "@batonfx/providers/deterministic"
import { classifyFailure as classifyOpenAiFailure, layer as openAiLayer } from "@batonfx/providers/openai"
import { layer as compatibleLayer } from "@batonfx/providers/openai-compat"
import { classifyFailure as classifyOpenRouterFailure, layer as openRouterLayer } from "@batonfx/providers/openrouter"
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
          compatibleLayer({
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

  testLayer(
    Layer.provide(
      Presets.layerGroq({
        model: "llama-test",
        apiKey,
        registrationKey: "primary",
        metadata: { contextWindow: 131_072 },
        classifyFailure: classifyOpenAiFailure,
      }),
      FetchHttpClient.layer,
    ),
  )((test) => {
    test.effect("creates an OpenAI-compatible preset registration for ModelRegistry", () =>
      Effect.gen(function* () {
        const registered = yield* ModelRegistry.registrations()
        const registration = registered[0]!

        expect(registered.map((item) => [item.provider, item.model])).toEqual([["groq", "llama-test"]])
        expect(registration.registrationKey).toBe("primary")
        expect(registration.metadata).toEqual({ contextWindow: 131_072 })
        expect(registration.classifyFailure).toBe(classifyOpenAiFailure)
      }),
    )
  })

  testLayer(
    Layer.mergeAll(
      Deterministic.layer({ model: "local" }),
      ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("round-trips the deterministic model through Agent.generate", () => {
      const agent = Agent.make({ name: "deterministic-agent", toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const result = yield* ModelRegistry.operate(
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
            Deterministic.layerOpenAi({
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
      Effect.provideService(HttpClient.HttpClient, hostHttpClient),
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
            Deterministic.layerOpenAi({
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
    }).pipe(Effect.provideService(HttpClient.HttpClient, hostHttpClient)),
  )

  it.effect("selects deterministic-only registration concurrently when OpenAI configuration is absent", () => {
    const fallbackLayer = Deterministic.layerOpenAi({
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
    }).pipe(
      Effect.provideService(HttpClient.HttpClient, hostHttpClient),
      Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown({})),
    )
  })

  it.effect("propagates malformed OpenAI configuration instead of selecting the fallback", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(
        Effect.scoped(
          Layer.build(
            Deterministic.layerOpenAi({
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
      Effect.provideService(HttpClient.HttpClient, hostHttpClient),
      Effect.provideService(
        ConfigProvider.ConfigProvider,
        ConfigProvider.fromUnknown({ OPENAI_API_KEY: "not-a-number" }),
      ),
    ),
  )

  testLayer(
    Layer.mergeAll(
      ModelRegistry.layerCombined([
        Deterministic.layer({ provider: "det-a", model: "model-a" }),
        Deterministic.layer({ provider: "det-b", model: "model-b" }),
      ]),
      ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("combines two withProvider layers so models from both resolve", () => {
      const agent = Agent.make({ name: "combined-agent", toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const registered = yield* ModelRegistry.registrations()
        expect(registered.map((item) => [item.provider, item.model])).toEqual([
          ["det-a", "model-a"],
          ["det-b", "model-b"],
        ])

        const first = yield* ModelRegistry.operate(
          { provider: "det-a", model: "model-a" },
          Agent.generate({ prompt: "hello" })(agent),
        )
        const second = yield* ModelRegistry.operate(
          { provider: "det-b", model: "model-b" },
          Agent.generate({ prompt: "hello" })(agent),
        )
        expect(first.text).toBe("deterministic response")
        expect(second.text).toBe("deterministic response")
      })
    })
  })

  testLayer(
    Layer.provide(
      ModelRegistry.layerCombined([
        anthropicLayer({ model: "claude-test", apiKey }),
        openRouterLayer({ model: "openrouter-test", apiKey }),
      ]),
      FetchHttpClient.layer,
    ),
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
      Embedding.layer({ model: "text-embedding-3-small", apiKey }),
      Embedding.layerCompatible({
        model: "embed-test",
        baseUrl: "http://localhost:11434/v1",
        apiKey,
      }),
    )
    const fetchLayers = tuple(
      Layer.provide(Embedding.layer({ model: "text-embedding-3-small", apiKey }), FetchHttpClient.layer),
      Layer.provide(
        Embedding.layerCompatible({ model: "embed-test", baseUrl: "http://localhost:11434/v1", apiKey }),
        FetchHttpClient.layer,
      ),
    )
    const baseRequirements: Assert<EveryLayerServices<typeof baseLayers, HttpClient.HttpClient>> = true
    const fetchRequirements: Assert<EveryLayerServices<typeof fetchLayers, never>> = true
    const baseErrors: Assert<EveryLayerError<typeof baseLayers, Config.ConfigError>> = true
    const fetchErrors: Assert<EveryLayerError<typeof fetchLayers, Config.ConfigError>> = true

    expect([baseRequirements, fetchRequirements, baseErrors, fetchErrors]).toEqual([true, true, true, true])
  })

  it("preserves HttpClient in provider requirements and discharges it through explicit fetch composition", () => {
    const baseLayers = tuple(
      openAiLayer({ model: "gpt-test", apiKey }),
      anthropicLayer({ model: "claude-test", apiKey }),
      openRouterLayer({ model: "openrouter-test", apiKey }),
      compatibleLayer({ model: "compatible-test", apiKey }),
      Presets.layerGroq({ model: "model", apiKey }),
      Presets.layerMistral({ model: "model", apiKey }),
      Presets.layerXai({ model: "model", apiKey }),
      Presets.layerDeepseek({ model: "model", apiKey }),
      Presets.layerGoogleAiStudio({ model: "model", apiKey }),
      Presets.layerAzureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.layerOllama({ model: "model", apiKey }),
    )
    const fetchLayers = tuple(...baseLayers.map((providerLayer) => Layer.provide(providerLayer, FetchHttpClient.layer)))
    const deterministicLayer = deterministicLayerOpenAi({ model: "gpt-test", fallbackModel: "fallback", apiKey })
    const deterministicFetchLayer = Layer.provide(
      deterministicLayerOpenAi({
        model: "gpt-test",
        fallbackModel: "fallback",
        apiKey,
      }),
      FetchHttpClient.layer,
    )
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
      Presets.layerGroq({ model: "model", apiKey }),
      Presets.layerMistral({ model: "model", apiKey }),
      Presets.layerXai({ model: "model", apiKey }),
      Presets.layerDeepseek({ model: "model", apiKey }),
      Presets.layerGoogleAiStudio({ model: "model", apiKey }),
      Presets.layerAzureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.layerOllama({ model: "model", apiKey }),
    )
    const fetchPresets = tuple(...basePresets.map((presetLayer) => Layer.provide(presetLayer, FetchHttpClient.layer)))
    const basePresetRequirements: Assert<EveryLayerServices<typeof basePresets, HttpClient.HttpClient>> = true
    const fetchPresetRequirements: Assert<EveryLayerServices<typeof fetchPresets, never>> = true
    const presetErrors: Assert<EveryLayerError<typeof basePresets, Config.ConfigError>> = true
    const fetchPresetErrors: Assert<EveryLayerError<typeof fetchPresets, Config.ConfigError>> = true

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
      openAiLayer({ model: "gpt-test", apiKey }),
      anthropicLayer({ model: "claude-test", apiKey }),
      openRouterLayer({ model: "openrouter-test", apiKey }),
      compatibleLayer({ model: "compatible-test", apiKey }),
      Presets.layerGroq({ model: "model", apiKey }),
      Presets.layerMistral({ model: "model", apiKey }),
      Presets.layerXai({ model: "model", apiKey }),
      Presets.layerDeepseek({ model: "model", apiKey }),
      Presets.layerGoogleAiStudio({ model: "model", apiKey }),
      Presets.layerAzureOpenAi({ model: "model", resource: "resource", apiKey }),
      Presets.layerOllama({ model: "model", apiKey }),
    ]
    const embeddingLayers = [
      Embedding.layer({ model: "text-embedding-3-small", apiKey }),
      Embedding.layerCompatible({
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
          deterministicLayerOpenAi({
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
            openAiLayer({
              model: "gpt-test",
              apiKey: Config.fail(new ConfigProvider.SourceError({ message: "missing test key" })),
            }),
          ),
        ),
      )

      expect(failure._tag).toBe("ConfigError")
    }).pipe(Effect.provideService(HttpClient.HttpClient, hostHttpClient)),
  )

  it("exposes provider layer constructors and subpath modules", () => {
    expect(typeof openAiLayer).toBe("function")
    expect(typeof anthropicLayer).toBe("function")
    expect(typeof openRouterLayer).toBe("function")
    expect(typeof compatibleLayer).toBe("function")
    expect(typeof deterministicLayerOpenAi).toBe("function")
    expect(typeof Presets.layerGroq).toBe("function")
    expect(typeof Presets.layerMistral).toBe("function")
    expect(typeof Presets.layerXai).toBe("function")
    expect(typeof Presets.layerDeepseek).toBe("function")
    expect(typeof Presets.layerGoogleAiStudio).toBe("function")
    expect(typeof Presets.layerAzureOpenAi).toBe("function")
    expect(typeof Presets.layerOllama).toBe("function")
    expect(FetchHttpClient.layer).toBeDefined()
  })
})
