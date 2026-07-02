# ADR-0005 — Session Event Log

## Status

Accepted.

## Context

`Ai.Chat` and `Chat.Persistence` model linear chat history. They do not represent branch pointers, `/tree` navigation, resume-with-fork, or lossless compaction. Later Baton features need a shared shape where the transcript is an immutable event log and the LLM prompt is a projection.

## Decision

Introduce `Session` in `@batonfx/core` as an append-only branch-pointer log plus a pure context projector. Core ships the entry union, the `SessionStore` service boundary, a non-durable `Ref`-backed memory layer, a `testLayer`, and `buildContext(path)`.

Durable implementations are host-side. Relay supplies a durable, addressable adapter without Baton importing Relay. Filesystem JSONL adapters live outside core.

`SessionStore` is not wired into `Agent.stream` in this decision.

## Consequences

- Compaction, steering, and context epochs can target one session seam.
- The agent loop remains unchanged until an explicit opt-in integration is specified.
- Baton keeps its effect-only dependency boundary and adds no filesystem or durable runtime dependency.

## Related docs

- `docs/spec/02-session-event-log.md`
- `docs/spec/01-baton-agent-framework.md`
