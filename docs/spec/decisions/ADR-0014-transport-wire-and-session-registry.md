# ADR-0014 — Transport wire and session registry

## Status

Accepted.

## Context

Baton needs chat transports to attach, replay, and follow long-running in-process agent runs. Relay needs to reuse the same transport handlers while replacing in-memory replay with durable execution events.

## Decision

Add `@batonfx/transport` with toolkit-parameterized wire schemas and a `SessionRegistry` service. The default `layerMemory` implementation is non-durable and same-process. `SessionRegistry` remains the single public transport facade while `layerMemory` privately composes deterministic execution coordination with a per-session frame journal. The journal serializes sequence allocation, bounded replay insertion, and subscriber delivery as one publication transition and owns snapshot replay plans. These private transport collaborators do not add services and do not reuse core `SessionStore`, whose ownership remains the agent event log and compaction seam. Terminal run outcomes are server frames, not connection errors. Replay cursors are frame sequences. Relay composes by providing a durable `SessionRegistry` implementation.

## Consequences

- Chat UIs can render completion, failure, and suspension uniformly as data.
- Slow subscribers are isolated from producers by bounded queues.
- Baton keeps process-local run ownership while leaving durable sessions to Relay.
- Concurrent publishers preserve identical ring and live-delivery order within a session without serializing independent sessions.
- Core session history and ephemeral transport execution remain separate ownership domains.
- Browser decoders use a loose schema for unknown tool names; strict server codecs remain toolkit-parameterized.

## Related docs

- `docs/spec/11-transport.md`
