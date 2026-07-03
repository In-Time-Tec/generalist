# Model Registry and Providers

Core is provider-agnostic. `ModelRegistry` maps `{ provider, model, registrationKey? }` to an Effect AI `LanguageModel` layer and fails typed when a selection is missing.

`@batonfx/providers` adds thin helpers for upstream Effect AI provider packages, OpenAI-compatible presets, deterministic local registration, embeddings, and an offline model catalog. Live provider snippets should read credentials through Effect `Config` in application code.

Google AI Studio can be reached through the OpenAI-compatible preset. Bedrock and first-party Google helpers wait for compatible upstream Effect AI providers.
