# ADR-0006 — Instructions Context Epoch

## Status

Accepted.

## Context

A single system-prompt string does not scale to base instructions, repository instructions, skills catalogs, memory recall, and future provider prompt-cache baselines. Later milestones need a shared seam where ordered sources contribute model context while preserving a stable baseline across a run.

## Decision

Introduce `Instructions` in `@batonfx/core` as an ordered context-source registry. Baton opens a `ContextEpoch` at run start: baseline sources render once into the system-message baseline, and dynamic sources are retained for later update rendering. The Agent consults this service only when present and only for first-turn system-message derivation; absent service, explicit `options.system`, and explicit `options.history` preserve current behavior.

Dynamic update injection is not part of this decision. Compaction and update milestones decide where rendered dynamic updates enter the transcript.

## Consequences

- Context sources from skills, repository instructions, and memory can compose through one ordered seam.
- The baseline-vs-dynamic distinction is explicit before durable hosts add provider-cache or epoch persistence behavior.
- Baton remains Effect-only and non-durable; filesystem and durable adapters stay host-side or in later packages.

## Related docs

- `docs/spec/03-instructions-and-context-epoch.md`
- `docs/spec/01-baton-agent-framework.md`
