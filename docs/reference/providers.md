---
title: "generalist/providers/*"
description: "Provider-neutral model utilities and exact provider, preset, catalog, and embedding subpaths."
---

Exact generalist/providers/\* leaves own the model catalog, deterministic test model, model routes, provider adapters, presets, and embeddings. There is no aggregate entry that loads every optional provider.

**Install core**

```bash
bun add effect@4.0.0-rc.112 generalist
```

Provider-neutral deterministic, catalog, and route leaves need no optional provider peer. For a provider leaf, add exactly the dependency shown below.

| Import                                                                  | Additional dependency                                                                                         | Runtime      |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------ |
| `generalist/providers/deterministic`                                    | none                                                                                                          | Node and Bun |
| `generalist/providers/anthropic`                                        | `@effect/ai-anthropic@4.0.0-rc.112`                                                                           | Node and Bun |
| `generalist/providers/openai` and OpenAI protocol leaves                | `@effect/ai-openai@4.0.0-rc.112`                                                                              | Node and Bun |
| `generalist/providers/openai-compatible` and compatible protocol leaves | `@effect/ai-openai-compat@4.0.0-rc.112`                                                                       | Node and Bun |
| `generalist/providers/openrouter`                                       | `@effect/ai-openrouter@4.0.0-rc.112`                                                                          | Node and Bun |
| `generalist/providers/amazon-bedrock`                                   | `@aws-sdk/client-bedrock-runtime@3.859.0`, `@aws-sdk/credential-provider-node@3.859.0`, `@smithy/types@4.3.1` | Node 22+     |

## Exports map

| Subpath                         | Contents                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `./openai`                      | `layerModel`, `layerConfig`, `layer`, `decodeConfig`, `credentialsFromAuth`                |
| `./openai-account-auth`         | OpenAI account OAuth protocol, token documents, lifecycle services, and host/storage seams |
| `./openai-account-auth-http`    | Standard OpenAI account authorization HTTP layer                                           |
| `./anthropic`                   | `layerModel`, `layerConfig`, `layer`, `decodeConfig`                                       |
| `./amazon-bedrock`              | `layerModel`, `layerClient`, `layer`, `decodeConfig`                                       |
| `./openrouter`                  | `layerModel`, `layerConfig`, `layer`, `decodeConfig`                                       |
| `./openai-responses`            | `layerModel`, `layerConfig`, `layer`, `decodeConfig`                                       |
| `./openai-chat-completions`     | `layerModel`, `layerConfig`, `layer`, `decodeConfig`                                       |
| `./deterministic`               | `layerModel`, `layer`                                                                      |
| `./openai-compatible`           | The seven OpenAI-compatible presets                                                        |
| `./openai-embedding`            | OpenAI embedding layer                                                                     |
| `./openai-compatible-embedding` | OpenAI-compatible embedding layer                                                          |
| `./model-catalog`               | Model catalog service, `bundled` metadata, and layers                                      |
| `./model-route`                 | Ordered model-route construction and availability validation                               |

## Model layers (layerModel)

Every provider exports `layerModel({ model, ... })`: a closed-over-its-client `Layer` providing `LanguageModel` plus the `ProviderName` and `ModelName` telemetry tags. Provide it directly to a run with `Effect.provide` — this is the default wiring. The underlying client layer (`layerConfig`, or `layerClient` for Bedrock) stays separate, so the model layer composes over any compatible client. Failure classification, image-source handling, and tool-schema compilation are baked into the model layer.

## Provider registrations

HTTP provider `layer` takes `apiKey` and `clientConfig` and returns an integrated `ModelRegistry.ModelRegistry` layer requiring `HttpClient.HttpClient`. Callers that select the global fetch transport explicitly compose `FetchHttpClient.layer`.

OpenAI, Anthropic, and OpenRouter registrations include provider-specific context-overflow classification. Unknown OpenAI-compatible endpoints classify no failures unless `classifyFailure` is explicitly supplied, such as `OpenAI.classifyFailure` for an endpoint known to preserve OpenAI failure semantics.

Every provider `decodeConfig` is an effectful decoder. It returns an `Effect` and rejects invalid persisted input through the typed `Schema.SchemaError` error channel; it does not throw or synchronously return configuration.

## OpenAI protocol adapters

| Export                        | Default provider          | Endpoint                                        |
| ----------------------------- | ------------------------- | ----------------------------------------------- |
| `OpenAI.layer`                | `openai`                  | `/responses` on the OpenAI API                  |
| `OpenAIResponses.layer`       | `openai-responses`        | `/responses` on a configurable `baseUrl`        |
| `OpenAIChatCompletions.layer` | `openai-chat-completions` | `/chat/completions` on a configurable `baseUrl` |

The compatible adapters accept an optional custom `provider` identity, arbitrary model string, provider config, API key, client config, base URL, registration key, metadata, and failure classifier. Unknown endpoints intentionally have no context-overflow classifier unless the caller supplies one.

`OpenAIResponses.decodeConfig` validates persisted Responses options against the OpenAI schema. `OpenAIChatCompletions.decodeConfig` accepts arbitrary JSON options for provider extensions while rejecting a nested `model` override; the registry selection remains the model authority.

## Amazon Bedrock

`AmazonBedrock.layer({ model, config?, client? })` registers `provider: "amazon-bedrock"` for any foundation-model ID, inference-profile ID, or ARN. `client` accepts region, endpoint, profile, refreshable credentials, redacted bearer token, authentication mode, request handler, and an optional coalesced credential-recovery effect. The default region is `us-east-1`.

Converse and ConverseStream preserve text, reasoning, tool calls, structured output, cache usage, request identity, stop reason, latency, trace, and additional response fields. Mid-stream service, throttling, validation, and model-stream exceptions fail with typed retry-aware AI reasons. Malformed lifecycle sequences fail as invalid output, while unknown future AWS union members are ignored without weakening validation of known events.

<Note title="The host owns HTTP">
Supply a traced, proxied, test, or platform HttpClient, or explicitly provide FetchHttpClient.layer when the global fetch transport is intentional.
</Note>

<Warning title="Registry layers require ModelRegistry.withModel">
Provider `layer` constructors return registry layers, not LanguageModel layers; wrap the run in `ModelRegistry.withModel({ provider, model }, effect)` to resolve the selection. Prefer `layerModel` when the model is known at construction — it provides LanguageModel directly.
</Warning>

## Deterministic

| Export                          | Notes                                                                                                                                                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layerModel(input?)`            | LanguageModel layer for a scripted model that always answers `"deterministic response"`; provide directly with `Effect.provide`. Provider and model both default to `"deterministic"`                                            |
| `layer(input?)`                 | Registry layer for the same scripted model, for `ModelRegistry.withModel` selection                                                                                                                                              |
| `layerOrDeterministic(options)` | Registry layer with the deterministic fallback (`fallbackModel` required) plus the OpenAI registration when its API-key config is present; only missing data falls back, while invalid or failing config remains a typed failure |

## OpenAICompatible

Each preset is a registry layer over the OpenAI-compatible client, pinned to the provider's base URL. `OpenAICompatible.Options` takes `model`, optional `apiKey`, `clientConfig`, `config`, `registrationKey`, `metadata`, and an optional `classifyFailure`. OpenAI-compatible presets classify no failures unless callers supply that classifier. Every preset layer requires HttpClient; callers choosing fetch explicitly compose FetchHttpClient.layer.

| Preset                | Provider name | Base URL                                                                     |
| --------------------- | ------------- | ---------------------------------------------------------------------------- |
| `layerGroq`           | `groq`        | `https://api.groq.com/openai/v1`                                             |
| `layerMistral`        | `mistral`     | `https://api.mistral.ai/v1`                                                  |
| `layerXAI`            | `xai`         | `https://api.x.ai/v1`                                                        |
| `layerDeepSeek`       | `deepseek`    | `https://api.deepseek.com/v1`                                                |
| `layerGoogleAIStudio` | `google`      | `https://generativelanguage.googleapis.com/v1beta/openai/`                   |
| `layerAzureOpenAI`    | `azure`       | `https://<resource>.openai.azure.com/openai/v1`: takes a required `resource` |
| `layerOllama`         | `ollama`      | `http://localhost:11434/v1`                                                  |

## Model catalog

`ModelCatalog` is a static-metadata service: `find(selection)`, `get(selection)` (fails with `ModelMetadataNotFound`), and `list`. `ModelMetadata` carries `provider`, `model`, `contextWindow`, `maxOutput`, optional `pricing` and `modalities`. `bundled` is a hand-maintained snapshot of six entries; `layer(overrides?)` merges overrides over it, `layerTest(entries)` uses exactly the given entries.

## Embedding

| Export                                                                 | Notes                                                                             |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `layer({ model, apiKey, clientConfig?, config? })`                     | `Ai.EmbeddingModel` layer over the OpenAI client requiring `HttpClient`           |
| `layerCompatible({ model, baseUrl, apiKey?, clientConfig?, config? })` | The same over any OpenAI-compatible endpoint at `baseUrl`, requiring `HttpClient` |

See [How to provide model providers](/guides/providers) and [How to test agents and run evals in CI](/guides/testing-evals).
