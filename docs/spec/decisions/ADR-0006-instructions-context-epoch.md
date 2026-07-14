# ADR-0006 — Instructions Context Epoch

## Status

Accepted. Amended by issue #56 to choose the baseline-only Agent contract and deprecate `renderUpdate`.

## Context

A single system-prompt string does not scale to base instructions, repository instructions, skills catalogs, memory recall, and future provider prompt-cache baselines. Ordered sources need a shared seam that preserves a stable baseline across a run. The original decision also exposed `renderUpdate` while deferring its Agent integration, leaving a public capability without timing, ordering, replay, resume, or persistence semantics.

## Decision

Keep `Instructions` as an ordered baseline context-source registry. Baton opens a `ContextEpoch` at run start and renders baseline sources once into the system-message baseline. The Agent consults this service only when present and only for first-turn system-message derivation; absent service, explicit `options.system`, and explicit `options.history` preserve current behavior.

Baton chooses a baseline-only Agent contract. It does not call `renderUpdate` or promise automatic dynamic-instruction timing, ordering, transcript insertion, replay, resume, or persistence. `renderUpdate` remains exported only as a source-compatible deprecated utility for hosts that already own those concerns. Its JSDoc directs Agent-integrated callers to `openEpoch`; removal will not occur before 1.0.0 and requires a separately planned major release.

TurnPolicy `Continue.overrides.instructions` is not a dynamic Instructions update. It prepends one system message to the selected follow-up prompt; `Ai.Chat` commits that prompt to history, where the message can remain visible to later turns and persisted chats.

## Consequences

- Context sources from skills, repository instructions, and memory can compose through one ordered seam.
- The public Instructions contract and Agent behavior both promise baseline derivation only.
- Existing direct `renderUpdate` callers retain source compatibility while migration is visible in generated declarations.
- Hosts needing changing context own insertion and persistence until a future ADR defines and implements a complete lifecycle.
- Baton remains Effect-only and non-durable; filesystem and durable adapters stay host-side or in later packages.

## Related docs

- `docs/spec/03-instructions-and-context-epoch.md`
- `docs/spec/01-baton-agent-framework.md`
