# Compaction

Compaction is optional. When provided, the loop consults a strategy before model turns and once after a context-overflow failure. The default strategy first microcompacts large tool outputs, then summarizes older session history into a checkpoint while keeping a recent suffix.

Core remains non-durable. Lossless history depends on the host-provided `SessionStore`; durable storage belongs to Relay or another runtime.

Recipe: [`../recipes/context-truncation-middleware.md`](../recipes/context-truncation-middleware.md).
