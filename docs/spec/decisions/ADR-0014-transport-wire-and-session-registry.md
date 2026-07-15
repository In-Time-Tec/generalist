# ADR-0014 — Transport wire and session registry

## Status

Accepted.

## Context

Baton needs chat transports to attach, replay, and follow long-running in-process agent runs. Relay needs to reuse the same transport handlers while replacing in-memory replay with durable execution events.

## Decision

Add `@batonfx/transport` with toolkit-parameterized wire schemas and a `SessionRegistry` service. The default `layerMemory` implementation is non-durable and same-process. `SessionRegistry` remains the single public transport facade while `layerMemory` privately composes deterministic execution coordination with a per-session frame journal. The journal serializes sequence allocation, transcript-version publication, bounded replay insertion, and subscriber delivery as one publication transition and owns snapshot replay plans. Each transition advances a replay point containing the latest complete transcript and the published frame sequence. `TurnCompleted` and `Completed` supply their transcript to that transition; other frames advance the boundary with the unchanged transcript version.

Opening a session acquires its persisted chat and initializes the journal from that chat before entering journal ownership. Each run refreshes the chat through persistence and records the exact instance used by that run, preserving shared-`chatId` updates while allowing failure and interruption to read finalized local history before publishing terminal frames without another persistence lookup. Attachment captures only journal state and never combines a captured sequence with a later persistence read. If a requested or implicit `-1` origin cannot be proven available in the bounded ring, attachment emits the captured replay point as a subscriber-local snapshot and follows it only with strictly newer frames. Subscriber registration is part of the same serialized capture, preventing a concurrent publication from being omitted or duplicated. No persistence integration runs while the journal transition is held open. Consumers apply snapshots as authoritative resets before ordinary sequence deduplication.

These private transport collaborators do not add services and do not reuse core `SessionStore`, whose ownership remains the agent event log and compaction seam. Terminal run outcomes are server frames, not connection errors. Replay cursors are frame sequences. Relay composes by providing a durable `SessionRegistry` implementation.

## Consequences

- Chat UIs can render completion, failure, and suspension uniformly as data.
- Slow subscribers are isolated from producers by bounded queues.
- Baton keeps process-local run ownership while leaving durable sessions to Relay.
- Concurrent publishers preserve identical ring and live-delivery order within a session without serializing independent sessions.
- Snapshot transcripts and advertised sequence boundaries are point-in-time consistent, including under concurrent publication.
- Cursorless and otherwise unavailable replay origins receive a complete snapshot instead of a truncated retained tail.
- Core session history and ephemeral transport execution remain separate ownership domains.
- Browser decoders use a loose schema for unknown tool names; strict server codecs remain toolkit-parameterized.

## Related docs

- `docs/spec/11-transport.md`
