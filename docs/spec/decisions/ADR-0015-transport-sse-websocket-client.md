# ADR-0015 — Transport SSE, WebSocket, and Client Adapters

## Status

Accepted. Amended: WebSocket command authority is bound immutably by the first attachment.

## Context

The transport wire format and `SessionRegistry` seam provide replayable session frames. Chat hosts need thin SSE and WebSocket adapters plus a small isomorphic client without coupling Baton to Relay or to a durable runtime.

## Decision

Add `@batonfx/transport` subpaths for SSE, WebSocket, and client adapters. They depend only on the existing wire schemas and `SessionRegistry`. SSE uses the pinned Effect SSE encoder and maps `Last-Event-ID` to `attach(afterSeq)`. WebSocket uses existing `Wire.ClientFrame` and `Wire.ServerFrame` values with one attached session per socket. The default client decodes `Wire.LooseServerFrame` and reattaches after reconnect with the last seen sequence.

Transport errors are not replay frames. Malformed WebSocket client frames and command dispatch failures close the socket rather than manufacturing non-monotonic `Failed` frames.

The first successful WebSocket `Attach(S)` establishes immutable authority for session `S` for that socket. A repeated `Attach(S)` is idempotent; `Attach(T)` fails when `T` differs. Every command is authorized server-side against the socket state before registry dispatch. `NotAttached` and `SessionMismatch` are schema-backed tagged protocol failures and close the socket with code `1008`, without changing client or server frame schemas. Initiating a protocol close atomically transitions the socket to a terminal state so concurrently queued handlers cannot attach or begin registry dispatch during the close handshake.

Client frame and status delivery use explicit positive-capacity Effect queues. Frames default to capacity 256 with backpressure, statuses to capacity 8 with sliding telemetry; dropping and sliding frame policies remain observable through monotonic frame-sequence gaps. Reconnection uses a host-overridable classifier and Effect `Schedule`, defaulting to exponential delays from 100 milliseconds bounded by five retries. Non-retryable errors fail immediately, finite exhaustion preserves the last `TransportError` in a typed `ReconnectExhausted`, and interruption releases all client-owned resources without being classified or retried. Attach encoding and writing remain typed failures rather than defects.

## Consequences

- Relay can reuse these handlers by providing a durable `SessionRegistry`.
- Clients have a simple reconnect contract based on frame sequence.
- Browser clients can display unknown tool data through loose decoding.
- Caller-controlled command session ids cannot escape the socket's attached session authority.
- Existing two-field `connect` calls remain source-compatible, but reconnect changes from infinite to finite by default and status tags become `Connecting`, `Connected`, `Disconnected`, and `Retrying`.
- Hosts that intentionally need a different finite retry or buffering policy configure it at connection acquisition.
- Command acknowledgements, multiplexing, EventSource wrappers, and offline command queues remain future protocol work.

## Related docs

- `docs/spec/11-transport.md`
