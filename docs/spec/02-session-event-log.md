# 02 — Session Event Log

Baton's `Session` module is the standalone, non-durable conversation event-log seam. It models a session as append-only entries plus a current leaf pointer; the LLM prompt is a pure projection of a root-to-leaf path.

## Scope

Baton owns:

- the closed session entry union: `Message`, `ToolCall`, `ToolResult`, `Memory`, `Skill`, `Steering`, `Handoff`, `Compaction`, and `BranchSummary`;
- the `SessionStore` service boundary;
- a `Ref`-backed in-memory layer and a `testLayer`;
- the pure `buildContext(path)` projector.

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
- `Compaction` stores a summary plus `firstKeptEntryId`. When present on the active path, the projector emits a checkpoint message and then only entries from the kept entry onward.
- `BranchSummary` stores a summary of an abandoned branch and projects as a system note.

Each entry has an opaque `id`, a `parentId` (`null` for a root entry), and optional metadata.

## Projection contract

`buildContext(path)` accepts entries ordered root-to-leaf and returns an `Ai.Prompt.Prompt`.

- Without compaction, it projects `Message` entries in order and renders `BranchSummary` entries as system notes.
- Without compaction, it projects all context-bearing entries in order. Prompt-native entries (`Message`, `ToolCall`, `ToolResult`, and `Steering`) retain their Effect AI roles and parts. Context notes (`Memory`, `Skill`, `Handoff`, and `BranchSummary`) render as tagged system messages.
- With one or more compactions, the last compaction wins. The projector emits one user checkpoint message containing `<conversation-checkpoint>`, then projects entries from `firstKeptEntryId` onward. Older entries remain in the path but are absent from the prompt.
- If a malformed path's `firstKeptEntryId` is missing, the projector emits the checkpoint and continues after the compaction entry rather than reintroducing compacted history.

## Agent integration

`SessionStore` is wired into `Agent.stream` only when `Compaction` is also present. In that mode the loop mirrors the authoritative transformed Chat transcript into the session path and appends a `Compaction` entry after summary checkpointing. Completed framework tool results enter Chat exactly once before this synchronization, so the same turn's session path includes them in call order. Raw pre-middleware response parts never enter the session path. Without `Compaction`, `SessionStore` remains a standalone seam and the current agent loop continues to use `Ai.Chat` only.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/decisions/ADR-0005-session-event-log.md`
- `docs/spec/decisions/ADR-0025-authoritative-transformed-response.md`
- `docs/spec/decisions/ADR-0036-framework-tool-result-checkpoint.md`
