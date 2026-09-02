# HITL over SSE

Run an in-memory Host example that produces a durable approval request as a `HostEvent` and encodes it with the same wire contract used by `generalist/server` SSE and WebSocket streams.

```bash
bun --cwd examples/hitl-over-sse start
```

Manual acceptance path: create a Session, start a named Agent, follow `/sessions/:id/events` until `ApprovalRequested`, resolve its token through `/runs/:id/approvals/:token`, then resume after the last Host cursor.
