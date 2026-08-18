# HITL over SSE

Run an in-memory `tenetkit/runtime` example that produces an approval suspension as canonical `RunEvent` values and encodes them for SSE. A real server provides the same Runtime layer to `Sse.respond` for downstream UI streaming.

```bash
bun --cwd examples/hitl-over-sse start
```

Manual acceptance path: admit a message, attach to its Run over SSE, observe `ApprovalRequested` and `RunWaiting`, resolve the wait through a command route, then reattach with the last event id.
