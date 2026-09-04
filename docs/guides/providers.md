---
title: "How to provide model providers"
description: "Provide a model layer directly to a run with layerModel, combine provider clients, and keep a deterministic layer for keyless environments."
---

`generalist` is provider-agnostic. The default wiring is two layers: a provider client layer (`layerConfig`) and a thin model layer over it (`layerModel`). Provide the model layer to a run with `Effect.provide` — no registry, no selection strings. `generalist/providers/*` leaves wrap the upstream `@effect/ai-*` packages with failure classification, image-source handling, and tool-schema compilation baked in.

**OpenAI profile**

```bash
bun add effect@4.0.0-rc.112 generalist @effect/ai-openai@4.0.0-rc.112
```

Install only the peer for each provider leaf you import. Anthropic uses `@effect/ai-anthropic@4.0.0-rc.112`; OpenAI, OpenAI Responses, and OpenAI embedding use `@effect/ai-openai@4.0.0-rc.112`; OpenAI Chat Completions, compatible presets, and compatible embedding use `@effect/ai-openai-compat@4.0.0-rc.112`. OpenRouter uses `@effect/ai-openrouter@4.0.0-rc.112`. Amazon Bedrock uses `@aws-sdk/client-bedrock-runtime@3.859.0`, `@aws-sdk/credential-provider-node@3.859.0`, and `@smithy/types@4.3.1` and is tested as a Node 22+ profile. The deterministic, model-catalog, and model-route leaves need no provider peer.

<Warning title="OpenRouter and strict TypeScript consumers">
The exact `@effect/ai-openrouter@4.0.0-rc.112` peer emits TS2411 errors from its generated declarations under TypeScript 7.0.2 when dependency declarations are checked. Until the upstream declarations are corrected, set `"skipLibCheck": true` in the consumer tsconfig. Generalist's own declarations remain checked; this skips declaration checking inside dependencies. No matching Effect issue existed when this guide was updated; see the [upstream Effect issue search](https://github.com/Effect-TS/effect/issues?q=is%3Aissue+ai-openrouter+TS2411).
</Warning>

**tsconfig.json**

```json
{
  "compilerOptions": {
    "strict": true,
    "skipLibCheck": true
  }
}
```

## 1. Provide a model layer to a run

Every provider exports `layerConfig(options)` for the client and `layerModel({ model })` for one model over that client. The model layer also carries `ProviderName` and `ModelName` tags, so telemetry names the exact model. The client layer requires a host `HttpClient` — compose `FetchHttpClient.layer` explicitly, or provide a tracing, proxy, or test client instead. Credentials come from Effect `Config`, never from string literals.

**layer-first.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { layerConfig as openAiClient, layerModel as openAiModel } from "generalist/providers/openai"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer in one sentence.",
})

// The provider client is one layer; each model is a thin layer over it.
const openAi = openAiClient({ apiKey: Config.redacted("OPENAI_API_KEY") }).pipe(Layer.provide(FetchHttpClient.layer))
const sol = openAiModel({ model: "gpt-5.6-sol" }).pipe(Layer.provide(openAi))

// Provide the model layer to exactly the run that should use it.
const program = Agent.run(agent, "Name one Effect data type.").pipe(
  Effect.provide(sol),
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

To change the model, provide a different model layer. To change the provider for that model, provide a different client layer under it. To give one child agent a different model, pass the model layer as the `model` option of `AgentTool.asTool` or `Handoff.target` — children without one inherit the ambient model. See [the multi-agent guide](/guides/multi-agent).

## 2. Keep CI keyless with the deterministic model

The deterministic model layer always answers `deterministic response` and needs no client or credentials, which makes it the model for CI evals and local development:

**deterministic-layer.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { layerModel as deterministicModel } from "generalist/providers/deterministic"

const agent = Agent.make({ name: "keyless-agent" })

// No credentials, no client: the deterministic model layer answers "deterministic response".
const program = Agent.run(agent, "Say the deterministic answer.").pipe(
  Effect.provide(deterministicModel()),
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
deterministic response
```

`layerOrDeterministic` from the OpenAI leaf builds a registry that installs the deterministic fallback always and OpenAI only when its API-key config is present, for environments that select by configuration. Missing key data selects deterministic-only registration; invalid values and configuration-source failures remain typed failures.

**openai-or-deterministic.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layerOrDeterministic } from "generalist/providers/openai"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "release-notes" })

const modelLayer = layerOrDeterministic({
  model: "gpt-4o-mini",
  fallbackModel: "gpt-4o-mini",
  apiKey: Config.redacted("OPENAI_API_KEY"),
})

const selection: ModelRegistry.ModelSelection = { provider: "deterministic", model: "gpt-4o-mini" }

const program = ModelRegistry.withModel(selection, Agent.run(agent, "Draft the release note.")).pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

## 3. Select dynamically with ModelRegistry

When the model is genuinely runtime data — chosen per request from a database row or a user setting — use `ModelRegistry`. A provider's `layer(config)` constructor registers one `{ provider, model, registrationKey? }` identity instead of providing a model directly, and `ModelRegistry.withModel(selection, effect)` resolves that identity to its `LanguageModel` for exactly that effect, failing with a typed `LanguageModelNotRegistered` when the selection is missing.

**openrouter.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({
  name: "assistant",
  instructions: "Answer in one sentence.",
})

const registryLayer = openRouterLayer({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const program = ModelRegistry.withModel(
  { provider: "openrouter", model: "openai/gpt-4o-mini" },
  Agent.run(agent, "Name one Effect data type."),
).pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  registryLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

<Warning title="The registry is not a model">
A provider registry layer provides `ModelRegistry.ModelRegistry`, not `Ai.LanguageModel`. Providing it where a run expects a language model fails with a missing-service error, so always pair it with `ModelRegistry.withModel`. Prefer `layerModel` whenever the model is known at construction.
</Warning>

## 4. Combine several providers

Model layers compose with plain `Effect.provide` scoping — the closest provide wins, so no combination helper is needed. Registries are different: every provider registry layer installs its own fresh registry under the same service tag, so `Layer.mergeAll` keeps only one provider's registrations. Combine registries with `ModelRegistry.layerMerged`; on identical identity the later layer wins.

**combine-providers.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as anthropicLayer } from "generalist/providers/anthropic"
import { layer as openRouterLayer } from "generalist/providers/openrouter"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "router" })

const registryLayer = ModelRegistry.layerMerged([
  anthropicLayer({ model: "claude-sonnet-4-5", apiKey: Config.redacted("ANTHROPIC_API_KEY") }),
  openRouterLayer({ model: "openai/gpt-4o-mini", apiKey: Config.redacted("OPENROUTER_API_KEY") }),
])

const runWith = (selection: ModelRegistry.ModelSelection) =>
  ModelRegistry.withModel(selection, Agent.run(agent, "Summarize the incident."))

const program = runWith({ provider: "anthropic", model: "claude-sonnet-4-5" }).pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const runtimeLayer = Layer.mergeAll(
  registryLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

## 5. Connect an OpenAI-compatible endpoint

Choose the adapter for the protocol the endpoint implements: `OpenAIResponses.layer` posts to `/responses`, while `OpenAIChatCompletions.layer` posts to `/chat/completions`. Both accept a custom `provider`, `model`, `baseUrl`, optional API key, provider configuration, registration key, and metadata. The provider string becomes part of the exact registry selection; it does not need to name a built-in provider.

**openai-compatible.ts**

```typescript
import { Config, Layer } from "effect"
import { ModelRegistry } from "generalist"
import { layer as chatCompletionsLayer } from "generalist/providers/openai-chat-completions"
import { layer as responsesLayer } from "generalist/providers/openai-responses"
import { HttpClient } from "effect/unstable/http"

const responses = responsesLayer({
  provider: "my-responses-endpoint",
  model: "reasoning-model",
  baseUrl: "https://models.example.com/v1",
  apiKey: Config.redacted("MODEL_API_KEY"),
  config: { max_output_tokens: 8_192 },
})

const chatCompletions = chatCompletionsLayer({
  provider: "my-chat-endpoint",
  model: "chat-model",
  baseUrl: "https://chat.example.com/v1",
  apiKey: Config.redacted("CHAT_API_KEY"),
  config: { max_tokens: 4_096 },
})

export const registryLayer: Layer.Layer<ModelRegistry.ModelRegistry, Config.ConfigError, HttpClient.HttpClient> =
  ModelRegistry.layerMerged([responses, chatCompletions])

export const responsesSelection: ModelRegistry.ModelSelection = {
  provider: "my-responses-endpoint",
  model: "reasoning-model",
}

export const chatSelection: ModelRegistry.ModelSelection = {
  provider: "my-chat-endpoint",
  model: "chat-model",
}
```

## 6. Register Amazon Bedrock

`AmazonBedrock.layer` accepts any Bedrock foundation-model ID, inference-profile ID, or ARN. Its client uses the AWS SDK credential chain, so environment credentials, shared profiles and roles, SSO or AWS CLI caches, credential processes, web identity, ECS, and IMDS work without copying credentials into registration data. Set `region` and optionally `profile`; bearer-token authentication is also available through `AWS_BEARER_TOKEN_BEDROCK` or an explicitly redacted `bearerToken`.

**amazon-bedrock.ts**

```typescript
import { Layer } from "effect"
import { ModelRegistry } from "generalist"
import { layer as amazonBedrockLayer } from "generalist/providers/amazon-bedrock"

const model = "us.anthropic.claude-sonnet-4-20250514-v1:0"

export const registryLayer: Layer.Layer<ModelRegistry.ModelRegistry> = amazonBedrockLayer({
  model,
  client: {
    region: "us-east-1",
    profile: "engineering",
  },
})

export const selection: ModelRegistry.ModelSelection = {
  provider: "amazon-bedrock",
  model,
}
```

## 7. Pick an OpenAI-compatible preset

OpenAICompatible are thin wrappers over `OpenAIChatCompletions.layer` that fix the provider name and base URL. Each preset constructor returns a registry layer requiring a host HttpClient; compose FetchHttpClient.layer explicitly when selecting fetch.

| Preset                                 | Provider   | Base URL                                                   |
| -------------------------------------- | ---------- | ---------------------------------------------------------- |
| `OpenAICompatible.layerGroq`           | `groq`     | `https://api.groq.com/openai/v1`                           |
| `OpenAICompatible.layerMistral`        | `mistral`  | `https://api.mistral.ai/v1`                                |
| `OpenAICompatible.layerXAI`            | `xai`      | `https://api.x.ai/v1`                                      |
| `OpenAICompatible.layerDeepSeek`       | `deepseek` | `https://api.deepseek.com/v1`                              |
| `OpenAICompatible.layerGoogleAIStudio` | `google`   | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `OpenAICompatible.layerAzureOpenAI`    | `azure`    | `https://{resource}.openai.azure.com/openai/v1`            |
| `OpenAICompatible.layerOllama`         | `ollama`   | `http://localhost:11434/v1`                                |

## Recipe: Gemini via the OpenAI-compatible preset

Generalist has no first-party Google helper yet because the upstream Effect AI Google provider is not compatible with the pinned beta, but Google AI Studio speaks the OpenAI protocol. Register it with the `layerGoogleAIStudio` preset and select `{ provider: "google", model: "gemini-2.0-flash" }`.

**gemini-openai-compat.ts**

```typescript
import { Config, Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layerGoogleAIStudio } from "generalist/providers/openai-compatible"
import { FetchHttpClient } from "effect/unstable/http"

const agent = Agent.make({ name: "gemini-agent" })

const providerLayer = layerGoogleAIStudio({
  model: "gemini-2.0-flash",
  apiKey: Config.redacted("GOOGLE_AI_STUDIO_API_KEY"),
})

const program = ModelRegistry.withModel(
  { provider: "google", model: "gemini-2.0-flash" },
  Agent.run(agent, "Summarize the Effect Layer type in one sentence."),
).pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  providerLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
).pipe(Layer.provideMerge(FetchHttpClient.layer))

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

For context windows and pricing of models reached through presets, pass overrides to the offline `ModelCatalog.layer`. The full export map is in [the provider-leaf reference](/reference/providers). To pin loop behavior without any provider at all, see [How to test agents and run evals in CI](/guides/testing-evals).
