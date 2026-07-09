# ADR-0020 — Public Deterministic Test Model

## Status

Accepted.

## Context

Baton's internal tests repeatedly hand-build Effect AI language models with mutable call counters. The provider package has a fixed deterministic fallback, but it cannot script tool calls, capture normalized prompts, coordinate concurrent runs, or prove compaction and steering behavior. Consumers need the same test seam without copying Baton internals or using provider credentials.

## Decision

Publish `@batonfx/test` with one `TestModel` namespace. Script values compile to Effect AI response parts, and a stateful fixture exposes a real `LanguageModel` layer, `ModelRegistry` registration helpers, atomic normalized request capture, and Effect-native request waiting and delays.

Keep fixture state outside the layer build so repeated model-registry resolution and queued top-level runs continue one cursor. Use Effect AI's `AiError` channel for scripted failures, mismatches, and exhaustion. Keep transport out of runtime dependencies; transport may consume the test package only in its own tests.

## Consequences

- Agent tests can assert prompts, tool calls, steering, queue order, compaction, structured output, retries, and usage without credentials.
- The public test kit exercises the same Effect AI provider boundary as real models.
- `@batonfx/test` depends only on `@batonfx/core` and `effect`.
- The fixed fallback in `@batonfx/providers` remains useful for smoke evals; the scripted model owns behavioral fixtures.
- Script exhaustion is loud and typed instead of silently repeating a final response.

## Related docs

- `docs/spec/13-test-kit.md`
- `docs/spec/08-providers.md`
- `docs/spec/11-transport.md`
