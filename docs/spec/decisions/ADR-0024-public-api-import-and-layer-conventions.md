# ADR-0024 — Public API Import and Layer Conventions

## Status

Accepted.

## Context

Baton packages expose intentional module namespaces from package roots, while provider and transport packages also retain public subpaths. Service implementations also use inconsistent Layer names such as `noopLayer`, `identityLayer`, `memoryLayer`, `layerNoop`, and `layerMemory`. Consumers should be able to predict the canonical import and Layer name without losing source compatibility.

## Decision

Consumers canonically import intentional module namespaces from a package root, such as `Memory` from `@batonfx/core`, `VectorStore` from `@batonfx/memory`, `OpenAi` from `@batonfx/providers`, and `SessionRegistry` from `@batonfx/transport`. A public subpath is warranted when it is an independently useful entrypoint, materially avoids loading unrelated optional integrations, or preserves an established integration boundary. The root namespace and subpath expose the same module surface. Existing provider and transport subpaths remain compatibility imports.

Service namespaces name their primary Layer factory or value `layer`. Named variants append the distinguishing noun: `layerMemory`, `layerNoop`, and `layerIdentity`. `testLayer` remains the Baton convention for exact test implementations. Identity describes a transformation participant that preserves input, such as an empty middleware chain. Noop describes a service whose operations deliberately perform no meaningful action, such as declining output spill or recalling and recording no memory. The names are not interchangeable.

Canonical aliases are additive. Superseded Layer names remain aliases of the same value, carry `@experimental` and `@deprecated` JSDoc with their replacement, and preserve the complete inferred type through `typeof` annotations. They will not be removed before 1.0.0 and may be removed only by a separately approved major release. Existing public subpaths remain exported through the same horizon; migration guidance is documented rather than implemented with wrapper modules that would duplicate module surfaces.

This convention governs service namespace Layer providers. Domain-level composition factories such as `combinedLayer`, provider `with*` factories, and upstream client configuration re-exports retain their established names unless a separate specification changes them.

## Consequences

- Root namespace imports are the predictable default while established subpaths remain source-compatible.
- Canonical service Layers use `layer`, `layerMemory`, `layerNoop`, `layerIdentity`, and `testLayer`.
- Compatibility aliases preserve runtime identity and exact Layer output, error, and requirement types.
- No wrapper modules, duplicate implementations, runtime boundaries, or resource lifecycle changes are introduced.
- Packed-consumer tests prove root namespaces, compatibility subpaths, canonical aliases, old aliases, and their public declaration types.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/08-providers.md`
- `docs/spec/09-memory.md`
- `docs/spec/11-transport.md`
- `docs/spec/14-package-distribution.md`
