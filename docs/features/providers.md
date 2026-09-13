# Model providers

Generalist uses Effect AI's provider-neutral `LanguageModel` contract. Choose an Effect AI provider in the application, then either provide its model Layer directly to an Agent run or register it in `ModelRegistry` for dynamic selection. Generalist does not wrap or republish vendor SDKs.

## Direct model composition

```ts
import { Effect, Layer } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent } from "generalist"

const assistant = Agent.make({ name: "assistant" })
declare const model: Layer.Layer<LanguageModel.LanguageModel>

const result = Agent.run("Summarize the incident.")(assistant).pipe(Effect.provide(model))
```

Construct `model` with the upstream Effect provider, including its credentials and transport. This fragment shows the Generalist boundary rather than a provider-specific setup.

## Dynamic selection

`ModelRegistry` maps `(provider, model, registrationKey?)` to a `LanguageModel` Layer. External adapters can build a registration with the public registry contract, including a provider-specific JSON Schema compiler and failure classifier when needed. Missing identities fail with typed `LanguageModelNotRegistered`.

The package retains three provider-neutral helpers:

- `generalist/providers/model-catalog` describes context windows, output limits, pricing, and modalities without constructing a provider client.
- `generalist/unstable/providers/model-route` selects among registered models under explicit availability semantics.
- `generalist/providers/deterministic` supplies scripted text for tests and CI without credentials or network access.

Embedding providers are ordinary Effect `EmbeddingModel` Layers supplied by the application. Generalist memory depends on that interface, not on a vendor adapter.

## Adapter rules

An external provider adapter should:

1. depend on the upstream Effect AI package itself;
2. expose a Layer or `ModelRegistry` registration without changing Generalist core;
3. preserve typed configuration and provider failures;
4. keep credentials out of model identity, metadata, events, and durable manifests;
5. qualify its tool schema compiler, usage mapping, streaming termination, and supported media against the upstream API.

Generalist owns loop invariants such as middleware projection, tool-call validation, retries, compaction, and committed model outcomes. Provider adapters should not reproduce those internals.

## Related

- Registry source: `packages/generalist/src/core/model/registry.ts`
- Deterministic provider: `packages/generalist/src/ai/provider/deterministic.ts`
- Site: `/docs/models`
