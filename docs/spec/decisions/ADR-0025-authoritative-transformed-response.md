# ADR-0025 — Authoritative Transformed Response

## Status

Accepted.

## Context

Effect AI `Chat.streamText` accumulates the raw model stream and commits it to Chat history when the stream channel releases. Baton historically applied `ModelMiddleware.transformPart` only after consuming that Chat stream. Events and tool dispatch therefore observed transformed parts while Chat, persistence, memory, Session synchronization, and compaction observed raw parts. Output redaction could leak raw text into downstream context, and rewritten tool-call identifiers could diverge from the identifiers used by tool results.

## Decision

Baton owns one ordered transformed response for each streamed model turn. It streams the active `LanguageModel` against the current Chat history, applies the middleware chain once as parts are pulled, and accumulates only parts that survive transformation. The transformed parts feed events, text accumulation, tool dispatch, and one Chat-history commit when the stream scope closes. Chat persistence, memory, Session synchronization, and compaction derive from that committed history. Baton does not call the raw-committing `Chat.streamText` path for streamed turns.

The commit remains streaming and scope-bound. It records only transformed parts that were pulled before success, typed failure, defect, interruption, or downstream early termination. Dropped parts are absent. A transformed tool-call identifier is used unchanged by dispatch and the matching framework tool result. Existing prompt middleware, structured-output behavior, public middleware types, and Effect AI `Prompt`/`Response` vocabulary remain unchanged.

## Consequences

- Raw response text cannot reappear through Chat history, persistence, memory, Session synchronization, or compaction after output middleware redacts it.
- Events, dispatch, and transcript consumers share transformed tool-call identifiers.
- Stream consumption remains lazy and backpressured; Baton does not buffer the provider stream before emitting parts.
- Chat mutation has one transformed response owner and runs as scoped cleanup on every stream exit.
- The repair is internal and introduces no second response format or public service.

## Rejected alternatives

- Continue using `Chat.streamText` and overwrite raw history afterward: rejected because raw history is observably committed and may be persisted before replacement.
- Transform separately for events and Chat: rejected because two transformations can diverge or repeat effects.
- Buffer the complete response before emitting events: rejected because it breaks streaming latency and bounded backpressure.

## Related docs

- `docs/spec/01-baton-agent-framework.md`
- `docs/spec/02-session-event-log.md`
- `docs/spec/06-compaction.md`
- `docs/spec/09-memory.md`
