# Model Registry and Providers

Core is provider-agnostic. `ModelRegistry` maps `{ provider, model, registrationKey? }` to an Effect AI `LanguageModel` layer and fails typed when a selection is missing.

`@batonfx/providers` adds thin helpers for upstream Effect AI provider packages, OpenAI-compatible presets, deterministic local registration, embeddings, and an offline model catalog. Live provider snippets should read credentials through Effect `Config` in application code.

To register several providers, combine their `with*` layers with `ModelRegistry.combine([withAnthropic(...), withOpenRouter(...)])`. `Layer.mergeAll` does not work here: each `with*` layer provides the same `ModelRegistry.Service` tag, so merging keeps only one provider's registrations.

Google AI Studio can be reached through the OpenAI-compatible preset. Bedrock and first-party Google helpers wait for compatible upstream Effect AI providers.
