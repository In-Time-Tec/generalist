# Transport

`@batonfx/transport` turns Agent events into replayable frames through an in-process `SessionRegistry`, SSE, WebSocket, and browser client adapters. Transport sessions and queues are process-local and distinct from core Session history.

- Frame sequence numbers are non-negative safe integers, start at zero, and increase per session.
- Every run ends with one `Ended` after `Completed`, `Suspended`, or `Failed`.
- Fixed endpoints validate exact startup-tool schemas. Runtime-dynamic endpoints accept unknown tool payloads while keeping common frame fields strict; this changes validation, not execution authority.
- Replay and live registration are one serialized journal transition. An unavailable cursor receives a local `Snapshot` then newer frames.
- Subscriber queues are bounded. A lagging subscriber fails without blocking the producer or other subscribers.
- Optional send queues are FIFO and bounded per session. Accepted work is lost when the registry layer is released.
- WebSocket attachment grants one socket authority over one session. Commands before attachment or for another session fail without dispatch.
- Client reconnect schedules are finite unless the caller deliberately supplies another finite policy.
