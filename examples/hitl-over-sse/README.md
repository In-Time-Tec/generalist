# HITL over SSE

Run an in-process session registry example that produces an approval suspension as replayable transport frames. A real server would pass the same registry to `Sse.respond(toolkit)` for downstream UI streaming.

```bash
bun --cwd examples/hitl-over-sse start
```

Manual acceptance path: open a session, attach over SSE, send a prompt, observe `ApprovalRequested`, `Suspended`, and `Ended`, resolve the approval through a command route, then reattach with the last event id.
