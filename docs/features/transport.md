# Transport

`@batonfx/transport` exposes Runtime lifecycle over SSE and WebSocket. Runtime persists compact canonical `RunEvent` values; the transport host resolves referenced model responses into a transient `ResolvedRunEvent` observer view before encoding. Transport carries exclusive replay cursors, reconnects observers, and dispatches explicit commands. It does not execute Agents, persist events, or own Run state.

- `ResolvedRunEvent` is the streamed observer vocabulary. It has the exact persisted lifecycle identity and sequence, with response content added only for committed or interrupted model-response delivery. SSE event IDs and WebSocket reconnect cursors equal the persisted event `sequence`.
- Replay is exclusive: a cursor of `n` requests events whose sequence is greater than `n`. `Last-Event-ID` takes precedence over the SSE `cursor` query parameter.
- Invalid cursors fail with `InvalidCursor`. Runtime `CursorExpired` remains typed and requires recovery through the separate snapshot resource.
- `Snapshot.get(runId)` returns `RunInspection` and its last applied cursor. A snapshot is not a `RunEvent` and never consumes or reuses a persisted sequence.
- Runtime owns bounded live subscriber queues. A lagging subscriber fails with `SubscriberLagged.lastDeliveredSequence`; WebSocket closes with that cursor in its close reason so the client can replay.
- WebSocket accepts only `Attach` and explicit `Cancel` transport commands. Closing SSE, WebSocket, or client scope interrupts observation only and never calls `Runtime.cancel`.
- Terminal facts and cursors are streamed exactly as persisted. Model response hydration does not add a lifecycle fact or sequence. Transport does not append `Ended`, status, failure, or snapshot frames.
- Durable producers encode with the canonical compact Runtime schema. Observer hosts resolve model references through Runtime before using the observer codec; observers reject unresolved model events, validate common identity and cursor fields, and retain unknown future event tags.
