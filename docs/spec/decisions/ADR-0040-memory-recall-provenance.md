# ADR-0040 — Memory Recall Provenance

## Status

Accepted

## Context

Agent recall flattened `Memory.Item.content` into an ordinary user message. Completed turns then passed the full Chat history to `Memory.remember`, so working memory could ingest that synthetic message and return it again on the next run. Content comparison cannot distinguish a recalled message from identical user-authored text, and compaction can transform recalled content into a summary checkpoint.

Effect AI `Prompt.Message` has no dedicated provenance field, but its schema-backed message `options` survive prompt concatenation, Chat export/import, persisted Chat, and Session `Message` projection. Session paths retain pre-compaction entries after the model projection becomes lossy.

## Decision

Mark the synthetic recalled user message with the Baton-owned `@batonfx/core/memory` message option `{ origin: "memoryRecall" }`. This option is structural transcript framing; message text and parts remain unchanged.

Export `Memory.projectTranscript`, a pure memory-specific projection that removes messages carrying that exact structural origin. Agent always applies this projection before `Memory.remember`. The full Chat transcript remains unchanged for model calls, events, persistence, suspension, and resume.

When Compaction and SessionStore are active, Agent projects memory from the lossless Session path instead of the compacted Chat history. `Session.buildMemoryContext` ignores synthetic Session context and compaction entries, retains prompt-native authored/model/tool entries in path order, and applies the same recall-origin filter. This preserves legitimate pre-compaction transcript content without remembering either recalled context or a summary derived from it. Legacy messages without the Baton option are treated as ordinary transcript content.

Middleware and compaction preserve marker-to-message association, not only marker cardinality. Agent snapshots recalled-message identity lineage before invoking middleware. A transform normally passes marked messages through by object identity; a transform that must rebuild recalled user content uses `Memory.replaceRecalledMessage` to register an authorized lineage-preserving replacement. Moving the option to another message, reconstructing a marked message without that boundary, duplicating it, or fabricating a marker fails with `MiddlewareViolation`, including in-place mutation. Compaction receives schema-detached message data in history, prompt, and Session-path views; marked copies retain lineage, preventing in-place message mutation from corrupting authoritative state even when compaction declines. Session-backed compaction results may omit marked history already retained in the lossless path, but marked messages from the unsynchronized current prompt remain required.

## Consequences

- Recalled text remains available to every model turn in the run but cannot recursively enter memory through Agent.
- User-authored text identical to recalled text remains eligible for retention because projection never compares content.
- The additive option survives Chat concatenation, persistence, suspension checkpoints, and resume without changing `RememberInput` or `AgentSuspended`.
- Existing custom Memory implementations remain source-compatible and receive a plain `Prompt.Prompt` that is already projected by core.
- Existing Session stores remain source-compatible because `MessageEntry` already stores `Prompt.Message` verbatim and no entry schema changes.
- Legacy histories lacking provenance cannot be retroactively classified and remain eligible for remembering.
- Prompt middleware that rebuilds recalled user content migrates through `Memory.replaceRecalledMessage`; custom compaction implementations pass recalled messages through unchanged. Ordinary unmarked messages remain freely transformable.
- No service requirement, error, resource, fiber, queue, or concurrency policy is added.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/06-compaction.md`
- `docs/spec/09-memory.md`
- `docs/spec/decisions/ADR-0027-memory-item-user-content.md`
