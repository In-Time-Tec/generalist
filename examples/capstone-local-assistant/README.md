# Capstone Local Assistant

Before wiring a chat app to a server, check that its agent services and UI state fit together. This offline capstone runs a deterministic agent with skills and working memory, then feeds constructed Host frames through a headless FoldKit chat update. It prints the skill count, chat entry count, and scripted answer without a model API key.

```bash
bun --cwd examples/capstone-local-assistant start
```

The program is a process-local composition smoke check, not a running browser app or a durable Runtime. Its constructed frames do not prove approval, reconnect, or restart recovery. The following is a manual acceptance checklist for a full app you build from this shape, not behavior exercised by this command:

1. Create a Host and mount `generalist/server` for typed HTTP, SSE, and WebSocket routes.
2. Render a FoldKit chat page backed by `generalist/unstable/foldkit` resources and subscriptions.
3. Send a prompt that activates the research skill and calls an approval-gated tool.
4. Observe suspend, approve, and resume.
5. Reconnect mid-stream and verify replay after the last sequence.
6. Send two sessions with the same memory subject and verify working-memory recall.
7. Drive a long thread with compaction enabled and verify the checkpoint appears before the recent suffix.
