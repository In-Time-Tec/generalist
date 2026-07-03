# 08 — Providers

`@batonfx/providers` contains ergonomic provider registration helpers for Baton. It adapts upstream `@effect/ai-*` provider packages into `@batonfx/core`'s `ModelRegistry` and exposes embedding layers over Effect AI's `EmbeddingModel` tag.

## Scope

Baton owns:

- provider registration functions for OpenAI, Anthropic, OpenRouter, and OpenAI-compatible endpoints;
- all-in-one `with*` layers that install provider client layers and a `ModelRegistry.Service`;
- a deterministic language model registration for tests and local development;
- OpenAI-compatible presets for providers that do not yet have an upstream Effect AI package;
- OpenAI and OpenAI-compatible embedding layers.

Baton does not own provider forks, durable provider routing, API-key storage, hosted metadata catalogs, or Relay shims in this milestone.

## Registration helpers

Registration helpers return `Effect<ModelRegistry.Registration, ...>` and use `ModelRegistry.registrationFromLayer` as the only registration primitive. Registry identity remains the core tuple of `provider`, `model`, and optional `registrationKey`; `metadata` is passed through only when supplied by the caller.

The package exports provider modules:

- `OpenAi.openAi(input)` registers provider `openai`.
- `Anthropic.anthropic(input)` registers provider `anthropic`.
- `OpenRouter.openRouter(input)` registers provider `openrouter`.
- `OpenAiCompatible.openAiCompatible(input)` registers `input.provider ?? "openai-compatible"`.

Each helper accepts the model name, optional language-model config, optional registration key, and optional metadata. Helpers do not store API keys or client config in registry metadata.

## All-in-one layers

`withOpenAi`, `withAnthropic`, `withOpenRouter`, and `withOpenAiCompatible` return `Layer<ModelRegistry.Service, Config.ConfigError>`. They compose the corresponding registration effect with the upstream client `layerConfig` and `FetchHttpClient.layer`.

The raw upstream `*Client.layerConfig` functions are re-exported for callers that want to assemble provider layers manually.

## Deterministic model

`Deterministic.deterministicModel(input)` registers a local `Ai.LanguageModel` that emits `deterministic response`. `withDeterministic` installs it as a `ModelRegistry` layer. `withOpenAiOrDeterministic` always registers the deterministic fallback and registers OpenAI only when its config resolves.

The deterministic helper is for tests and local development only. It is not a replay, fixture, or durable execution mechanism.

## OpenAI-compatible presets

Presets are thin wrappers over `openAiCompatible` with a provider name and base URL:

| Preset           | Provider   | Base URL                                                   |
| ---------------- | ---------- | ---------------------------------------------------------- |
| `groq`           | `groq`     | `https://api.groq.com/openai/v1`                           |
| `mistral`        | `mistral`  | `https://api.mistral.ai/v1`                                |
| `xai`            | `xai`      | `https://api.x.ai/v1`                                      |
| `deepseek`       | `deepseek` | `https://api.deepseek.com/v1`                              |
| `googleAiStudio` | `google`   | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `azureOpenAi`    | `azure`    | `https://{resource}.openai.azure.com/openai/v1`            |
| `ollama`         | `ollama`   | `http://localhost:11434/v1`                                |

Each preset has a matching `with*` layer form. Presets remain wrappers; they do not introduce provider-specific behavior beyond the provider name and base URL.

## Embeddings

Embeddings are not registered in `ModelRegistry`, which is language-model-only. `Embedding.withOpenAiEmbedding` and `Embedding.withOpenAiCompatibleEmbedding` return layers for `Ai.EmbeddingModel.EmbeddingModel` and compose the matching upstream embedding model with the matching upstream client and `FetchHttpClient.layer`.

Memory packages consume the Effect AI embedding tag rather than importing provider packages.

## Model metadata catalog

`@batonfx/providers/catalog` exposes an offline-safe `ModelCatalog` service for model metadata: context window, maximum output tokens, optional price-per-million-token fields, and optional text/image/audio modalities.

`Catalog.layer(overrides?)` serves a bundled static snapshot and applies caller overrides by exact `(provider, model)` identity. `Catalog.testLayer(entries)` installs only the provided entries for tests. `lookup` returns `undefined` for unknown models; `require` fails with `ModelMetadataNotFound`.

The bundled table is intentionally not exhaustive. It is a checked-in snapshot for common models, not a hosted metadata system. Callers that need fresher prices, region-specific limits, custom OpenAI-compatible deployments, or private models pass overrides.

A future live metadata fetcher, if added, must be an explicit optional layer and must not replace the offline-safe default.

### Provider metadata gaps

Google AI Studio is reachable through the OpenAI-compatible preset. Baton does not ship first-party Google or Bedrock provider helpers in this milestone because the relevant upstream Effect AI providers are not compatible with the pinned Effect AI v4 beta catalog used by this repository. Users can still represent those models through catalog overrides when they use an OpenAI-compatible endpoint or their own provider layer.

## Integration

Consumers install `@batonfx/providers` when they want provider convenience helpers. `@batonfx/core` remains provider-agnostic and `effect`-only. Relay can later re-export these helpers or compose them into durable addressable runs without Baton depending on Relay.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0011-provider-registration-helpers.md`
- `docs/spec/decisions/ADR-0012-model-metadata-catalog.md`
