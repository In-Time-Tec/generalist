# ADR-0037 — Unique Transformed Tool-call IDs

## Status

Accepted.

## Context

Model middleware may rewrite streamed tool-call IDs. ADR-0025 makes those transformed parts authoritative for events, tool results, dispatch, Chat history, persistence, memory, Session synchronization, and compaction. Without a uniqueness gate, two provider calls or a middleware rewrite can produce one authoritative ID and dispatch multiple side effects under an ambiguous correlation identity.

## Decision

Baton validates every transformed `tool-call` ID, including provider-executed calls, in stream order before exposing that part to events, authorization, execution, routing, approvals, or transformed history. IDs must be unique within one model response. A later model turn or independent run owns a fresh registry and may reuse an earlier ID.

The registry records each ID's zero-based position among transformed tool-call parts. A duplicate fails the stream with the public schema-backed `DuplicateToolCallId { id, firstIndex, duplicateIndex }`, classified as a model/protocol failure in `Agent.RunError`. Calls before the duplicate may complete exactly once. The duplicate and every later part initiate no work, and the duplicate is not committed to authoritative transformed history.

The registry uses an Effect `Ref` over an immutable `HashMap` and is allocated inside the scoped model-response acquisition. Each transformed part carries a lazy acceptance Effect; default-sequential `Stream.flatMap` runs acceptance in input order before appending the part to authoritative history or dispatching it downstream. `Ref.modify` atomically advances the tool-call position and registry. Its size is bounded by the model response's already-bounded tool-call count; it introduces no cross-turn state, service requirement, detached fiber, or concurrency.

## Consequences

- Middleware and provider adapters must produce stable unique IDs within each response.
- Distinct raw provider IDs that middleware collapses are rejected using the transformed ID.
- Original IDs replaced by middleware do not create false collisions.
- Existing model, middleware, interruption, cancellation, scope, and transformed-history cleanup semantics remain unchanged.
- Executors require no API migration, but middleware that intentionally reused IDs must derive unique deterministic replacements.

## Rejected alternatives

- Validate provider IDs before middleware: rejected because those IDs are not authoritative after transformation.
- Generate replacement IDs: rejected because Baton would hide a model/protocol violation and alter provider correlation identity.
- Deduplicate by replaying the first result: rejected because this issue requires rejecting ambiguous calls before side effects rather than inventing replay semantics.
- Use a run-global registry: rejected because uniqueness belongs to one model response and broader scope would reject valid later-turn reuse.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
