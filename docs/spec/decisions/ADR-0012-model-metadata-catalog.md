# ADR-0012 — Model Metadata Catalog

## Status

Accepted.

## Context

Compaction thresholds, usage reporting, and provider-aware defaults need context-window, maximum-output, pricing, and modality metadata. Baton core must not become provider-aware or depend on provider packages.

## Decision

Add `ModelCatalog` to `@batonfx/providers` as an offline-safe static metadata service. The default layer serves a bundled checked-in table plus caller overrides. Unknown models are non-fatal through `lookup` and typed failures through `require`.

Do not fetch live provider metadata by default. Do not integrate the catalog into core compaction or usage math in this issue.

## Consequences

- `@batonfx/core` remains independent of provider packages.
- Standalone users can resolve common model metadata without network access.
- Bundled metadata can become stale; callers can override entries until a release or future explicit fetcher updates them.
- Future live fetchers must be opt-in layers behind the same service.
