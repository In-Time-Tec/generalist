# ADR-0033 — Truthful Agent Requirements

## Status

Accepted

## Context

The second `Agent` type parameter previously recorded only whether an agent carried a model selection. Configured memory, persisted execution, and transformation requirements were discovered at runtime and erased from public Effect environments. The boolean marker was structurally assignable in ways that could discard requirements, and ordinary run options could request persistence without exposing `Chat.Persistence`.

## Decision

`Agent<Tools, R>` is an opaque value whose tool and requirement parameters are invariant. `R` contains the model service selected by configuration, configured memory, static toolkit handlers, and tool handler services. A direct-model agent requires `LanguageModel`; an agent carrying a model selection requires `ModelRegistry.Service`; configuring memory adds `Memory`. Widened optional configuration retains every service that may be required at runtime.

Ordinary `stream`, `streamObject`, `generate`, and `generateObject` operations preserve the agent requirements and add run-specific memory or schema requirements. Persisted execution uses distinct `persisted`, `persistedObject`, `generatePersisted`, and `generatePersistedObject` operations whose environments additionally require `Chat.Persistence`. Ordinary run options reject persistence, and persisted options reject history.

`provideModel` accepts an infallible `LanguageModel` layer, removes only `LanguageModel` from the agent requirements, adds the layer requirements, and provides the layer around complete stream consumption. Agent-tool, handoff, fan-out, supervisor, and transport transformations preserve the requirements of the agents they execute.

Services consulted only when ambiently present remain optional: `Approvals`, `Compaction`, `Instructions`, `ModelMiddleware`, `ModelResilience`, `Permissions`, `SessionStore`, `SkillSource`, `Steering`, `Tokenizer`, `ToolExecutor`, and `ToolOutputStore`. Configuring model selection, memory, persistence, static tools, or run-specific memory is not ambient discovery and therefore remains visible in the operation environment.

## Consequences

- An Agent cannot be structurally reassigned to erase model, memory, tool, or layer requirements.
- Missing configured services are rejected by Effect composition before execution in typed consumers; defensive runtime checks remain for JavaScript and unsafe callers.
- Persisted and in-memory execution have distinct public contracts while sharing one internal loop.
- Consumers migrate `Agent<Tools, true | false>` annotations to `Agent<Tools, R>`, move `RunOptions.persistence` calls to persisted operations, and provide layers against the resulting Effect or Stream environment.
- This is a breaking type-level redesign. It does not change selected-model layer ownership or semaphore lifetime, which remains coordinated with issue #65.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/09-memory.md`
- `docs/spec/10-multi-agent.md`
- `docs/spec/11-transport.md`
