# Capstone Local Assistant

This offline capstone composes the release-train packages in one Bun workspace: core agent primitives, deterministic provider registration, skills, working memory, transport wire frames, and a FoldKit headless chat update.

```bash
bun --cwd examples/capstone-local-assistant start
```

Manual acceptance script for a full app built from this shape:

1. Start an HTTP server with `generalist/transport` SSE and WebSocket handlers.
2. Render a FoldKit chat page backed by `generalist/foldkit` resources and subscriptions.
3. Send a prompt that activates the research skill and calls an approval-gated tool.
4. Observe suspend, approve, and resume.
5. Reconnect mid-stream and verify replay after the last sequence.
6. Send two sessions with the same memory subject and verify working-memory recall.
7. Drive a long thread with compaction enabled and verify the checkpoint appears before the recent suffix.
