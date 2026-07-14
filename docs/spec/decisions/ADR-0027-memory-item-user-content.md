# ADR-0027 — Memory Item User Content

## Status

Accepted

## Context

`Memory.Item.parts` accepted every Effect AI `Prompt.Part`, but Agent recall could insert only `Prompt.TextPart` and `Prompt.FilePart` into a user message. Reasoning, tool-call, tool-result, and approval protocol parts therefore passed the public memory boundary and failed later while Agent built the recalled prompt.

## Decision

Replace `Memory.Item.parts` with `Memory.Item.content: ReadonlyArray<Prompt.UserMessagePart>` and export `ItemPart` as the same `Prompt.TextPart | Prompt.FilePart` union. Agent flattens item content in recall and inserts it directly as one user message without runtime part-kind validation.

Export `itemFromPromptPart(part)`, which returns `Option.some(part)` for text and file parts and `Option.none()` for every protocol-only part. Legacy consumers use this explicit boundary to filter broad stored parts or reject a legacy item when any conversion returns `None`; Baton does not reinterpret protocol parts as text. This decision does not assign provenance to recalled content; structural recall provenance and memory-specific transcript projection remain coordinated follow-up work.

## Consequences

- Every well-typed `Memory.Item` is representable as Effect AI user-message content.
- Reasoning, tool calls, tool results, and approval parts are rejected at compile time and by explicit legacy conversion rather than during Agent execution.
- Recall item and part ordering remain unchanged, and all-empty recall results insert no synthetic user message.
- Existing text-only implementations require only the mechanical `parts` to `content` field rename.
- The correction is intentionally breaking while Baton and Effect AI remain experimental.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/09-memory.md`
