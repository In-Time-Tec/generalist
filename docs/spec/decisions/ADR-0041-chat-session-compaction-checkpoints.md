# ADR-0041 — Chat-Session Compaction Checkpoints

## Status

Accepted.

## Context

The Agent loop synchronized Session with a mutable projected-message count and applied compaction to Chat before appending a fallible Session boundary. A failed or ambiguously interrupted append could therefore leave Chat ahead of Session, duplicate or skip later synchronization, and make retry unsafe. Summary projection also preserved compacted-head system messages in live Chat while the legacy Session projector rebuilt only the summary and kept suffix.

Summary, truncate, tool-output microcompaction, and custom implementations returned the same general changed-projection contract but only summary produced a Session boundary. This allowed non-summary implementations to bypass point-in-time replay invariants.

## Decision

Introduce one version 2 checkpoint protocol for every Session-backed compaction result. A prepared checkpoint carries a store-reserved stable id, expected parent leaf, the exact projected Chat history, and optional summary metadata. `SessionStore.appendCheckpoint` atomically validates the expected leaf and appends idempotently. An exact duplicate returns the authoritative stored checkpoint without moving the active leaf; an id reused with different content or a stale parent fails with schema-backed `SessionConflict`.

The loop synchronizes Chat messages by rebuilding `Session.buildContext(path)`, structurally aligning that projection as one unique contiguous Chat range preceded only by hoisted system messages, and deriving an exact suffix. Each message append checks its expected leaf, so retry after failure or interruption rereads the path and cannot duplicate an acknowledged or ambiguously committed message. Session entry identity replaces projected message count as the progress boundary.

Replacement-only transitions, including suspension metadata changes, first commit the pre-replacement Chat projection, synchronize it as ordinary lossless entries, and then append the exact checkpoint. Memory replay can therefore ignore synthetic checkpoint projections without losing authored, model, or tool transcript content, while interruption cannot leave uncommitted ordinary entries ahead of Chat.

Checkpoint append happens before Chat application. The append remains interruptible so cancellation reaches external stores; after an acknowledged append, applying the store-returned projection to Chat is uninterruptible. A definite append failure leaves Chat unchanged. If an append commits but acknowledgment is interrupted, Session may be ahead temporarily; the next synchronization recognizes a trailing version 2 checkpoint whose predecessor projection equals Chat and applies its exact stored projection. Other divergence fails typed rather than guessing.

`Session.buildContext` treats the latest version 2 checkpoint's exact history as the projection base and appends only entries after that checkpoint. Legacy compaction entries with no version retain the existing summary plus `firstKeptEntryId` rule. New Agent commits write only version 2. Existing custom stores must implement id reservation, expected-leaf append, and idempotent checkpoint append; legacy append cannot safely emulate this protocol.

The default summary policy continues to preserve compacted-head system messages. Custom strategies may choose another valid projection, but live and rebuilt views use exactly that returned value. The protocol adds no durable runtime, background reconciliation fiber, queue, or new payload vocabulary.

## Consequences

- Failed Session writes cannot commit Chat ahead of Session.
- Ambiguous retries cannot duplicate checkpoints or ordinary synchronized messages.
- Summary, microcompaction, truncate, custom, and repeated mixed compactions share one replay rule.
- Exact point-in-time projection removes separate system-message and kept-entry reconstruction policies for new checkpoints.
- Store implementations have a deliberate pre-1.0 migration, while existing stored paths remain readable.
- Errors and requirements remain visible; cancellation and resource ownership remain Effect-managed, and no concurrency or buffering primitive is added.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/06-compaction.md`
- `docs/spec/decisions/ADR-0005-session-event-log.md`
- `docs/spec/decisions/ADR-0009-compaction-strategy-seam.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0036-framework-tool-result-checkpoint.md`
