# 02 — Session Event Log

Baton's `Session` module is the standalone, non-durable conversation event-log seam. It models a session as append-only entries plus a current leaf pointer; the LLM prompt is a pure projection of a root-to-leaf path.

## Scope

Baton owns:

- the closed session entry union: `Message`, `ToolCall`, `ToolResult`, `Memory`, `Skill`, `Steering`, `Handoff`, `Compaction`, and `BranchSummary`;
- the `SessionStore` service boundary;
- a `Ref`-backed in-memory layer and a `testLayer`;
- the pure model `buildContext(path)` and memory `buildMemoryContext(path)` projectors.

Baton does not own durable/addressable storage, JSONL filesystem adapters, Relay adapters, `/tree` UI, or Agent loop integration in this issue. Durable hosts provide their own `SessionStore` implementation at the boundary.

## Invariants

- The log is append-only. Branching is represented by moving the mutable current leaf pointer and appending a new child.
- LLM context is not stored separately; it is a pure function of a root-to-leaf path.
- Compaction is lossless in the log and lossy only in the projected prompt.
- Core uses Effect services and in-memory state only; no filesystem, clock, randomness, or durable runtime dependency.

## Entry model

- `Message` stores one `Ai.Prompt.Message` verbatim.
- `ToolCall` stores one `Ai.Prompt.ToolCallPart` and projects it as an assistant tool-call message.
- `ToolResult` stores one `Ai.Prompt.ToolResultPart` and projects it as a tool message.
- `Memory` stores recalled or persisted memory text and projects as a system context note.
- `Skill` stores an activated skill name and body and projects as a system context note.
- `Steering` stores one live steering `Ai.Prompt.Message` verbatim so user/system steering remains role-aware.
- `Handoff` stores a target agent name and summary and projects as a system context note.
- Legacy `Compaction` entries store a summary plus `firstKeptEntryId`. Version 2 entries store the exact projected Chat history and a stable checkpoint identity. New Agent commits write only version 2; legacy entries remain readable without rewriting.
- `BranchSummary` stores a summary of an abandoned branch and projects as a system note.

Each entry has an opaque `id`, a `parentId` (`null` for a root entry), and optional metadata.

## Projection contract

`buildContext(path)` accepts entries ordered root-to-leaf and returns an `Ai.Prompt.Prompt`.

- Without compaction, it projects `Message` entries in order and renders `BranchSummary` entries as system notes.
- Without compaction, it projects all context-bearing entries in order. Prompt-native entries (`Message`, `ToolCall`, `ToolResult`, and `Steering`) retain their Effect AI roles and parts. Context notes (`Memory`, `Skill`, `Handoff`, and `BranchSummary`) render as tagged system messages.
- With one or more compactions, the last compaction wins. A version 2 checkpoint contributes its exact stored projection followed by context-bearing entries appended after that checkpoint. A legacy checkpoint emits one user checkpoint message containing `<conversation-checkpoint>`, then projects entries from `firstKeptEntryId` onward. Older entries remain in the path but are absent from the prompt.
- If a malformed path's `firstKeptEntryId` is missing, the projector emits the checkpoint and continues after the compaction entry rather than reintroducing compacted history.

`buildMemoryContext(path)` is the lossless memory-retention projection. It walks the whole path, ignores compaction and synthetic context entries, retains prompt-native `Message`, `ToolCall`, `ToolResult`, and `Steering` entries in order, and removes `Message` values carrying Baton's structural `memoryRecall` origin. It never compares content. Agent uses this projector before `Memory.remember` when compaction integration has an active Session path.

## Agent integration

`SessionStore` is wired into `Agent.stream` only when `Compaction` is also present. In that mode the loop derives synchronization deltas by structurally aligning the Session projection as one unique contiguous range in authoritative transformed Chat history, with only hoisted system messages permitted before it; projected message count is never a persistence cursor. Each message append checks its expected leaf, and retry rebuilds the path before deriving the remaining suffix.

Every changed compaction result, including summary, tool-output microcompaction, truncate, and custom implementations, is normalized into one prepared version 2 checkpoint. The store reserves its stable id, atomically checks the expected parent, and appends idempotently. An exact duplicate returns the stored checkpoint; an id reused with different content or a stale parent fails with a typed `SessionConflict`. The loop applies the store-returned projection to Chat only after append acknowledgment. A definite append failure therefore leaves Chat unchanged, while an ambiguous committed write is discovered from the Session path and reconciled on retry. Completed framework tool results enter Chat exactly once before synchronization, so the same turn's Session path includes them in call order. Raw pre-middleware response parts never enter the path.

Existing custom `SessionStore` implementations must add `reserveEntryId`, expected-leaf append handling, and `appendCheckpoint`. This deliberate pre-1.0 protocol migration cannot be safely emulated through legacy `append`, because doing so would lose idempotency and conflict detection. Existing stored compaction entries with no version retain their legacy projection rule; no eager rewrite is required.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0005-session-event-log.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0036-framework-tool-result-checkpoint.md`
- `docs/spec/decisions/ADR-0040-memory-recall-provenance.md`
- `docs/spec/decisions/ADR-0041-chat-session-compaction-checkpoints.md`
