# ADR-0011 — Provider Registration Helpers

## Status

Accepted.

## Context

Baton core already has a provider-agnostic `ModelRegistry`, but standalone users still need ergonomic ways to create registrations from upstream Effect AI provider packages. Existing Relay helpers are Baton-shaped and do not depend on Relay runtime concerns.

## Decision

Create `@batonfx/providers` as a thin helper package over `@batonfx/core` and upstream `@effect/ai-*` packages. Baton will ship registration helpers, `with*` registry layers, OpenAI-compatible presets, deterministic test/local model registration, and embedding layers.

Base provider, preset, deterministic fallback, and embedding constructors preserve the upstream Effect Platform `HttpClient` requirement. This keeps transport ownership, decoration, testing, and resource lifetime in the host layer graph. Explicitly named `*Fetch` conveniences provide `FetchHttpClient.layer` for applications that intentionally choose the global fetch transport; unnamed constructors never select a transport.

Do not add provider-specific runtime seams to core. Do not fork providers. Do not add embedding registration to `ModelRegistry` in this milestone.

## Consequences

- `@batonfx/core` remains `effect`-only and provider-agnostic.
- Standalone Baton users can register common providers without Relay.
- Provider package dependencies live only in `@batonfx/providers`.
- Embeddings compose through Effect AI's `EmbeddingModel` tag until a future issue defines any memory-specific integration.
- Host applications can supply one decorated `HttpClient` across providers, while fetch-backed setup remains available through conspicuously named conveniences.
