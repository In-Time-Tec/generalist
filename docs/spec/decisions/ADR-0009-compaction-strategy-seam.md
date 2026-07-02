# ADR-0009 — Compaction Strategy Seam

## Status

Accepted.

## Context

Long agent runs can overflow provider context windows. Baton already owns the loop, tool-result re-feed, tool-output spill seam, and session projector, but it must remain standalone and non-durable. Relay may later provide a durable fresh-run handoff strategy, and a model metadata catalog will later supply provider context windows.

## Decision

Model compaction as an optional Effect service with a pluggable strategy. The default strategy performs cheap tool-output microcompaction first, then summarizes older session history into one checkpoint while keeping a recent suffix verbatim. The loop consults the service before a streamed model turn and once after a pre-emission context-overflow failure.

Use `docs/spec/06-compaction.md` and ADR-0009 because prior issues already allocated spec documents 04/05 and ADR-0007/0008.

## Consequences

- Absent `Compaction` preserves existing behavior exactly.
- Core does not invent a model metadata catalog; finite context windows come from run/layer hints until the catalog lands.
- Core does not add durable storage; lossless history depends on a provided `SessionStore`, and durable implementations remain host-owned.
- Summary is a dedicated model call, not another agent loop, so it cannot execute tools or recursively trigger the loop.
- Relay can later provide an alternative strategy without changing Baton's loop contract.
