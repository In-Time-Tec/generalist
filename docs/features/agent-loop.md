# Agent loop

`@batonfx/core` runs a non-durable model-turn loop over Effect AI `Prompt`, `Response`, `Chat`, tools, and language models. Turn zero always runs. Later turns run only while the turn policy continues with pending tool results.

- Middleware-transformed response parts are authoritative for events, history, tools, memory, sessions, and compaction.
- Transformed tool-call ids must be unique within one model response. A duplicate fails before that call starts work.
- Framework tool results enter Chat once, in call order, before session sync, memory retention, policy evaluation, persistence, and `TurnCompleted`.
- Declared tool failures remain schema-valid domain results. Routing, schema, handler-boundary, placement, and authorization failures terminate through typed `FrameworkFailure` values.
- A policy stop with pending results is typed. It never silently drops results.
- Ordinary and persisted runs are separate entrypoints; persisted runs require Effect AI `Chat.Persistence`.
- Agent requirements remain visible through model selection, memory, tool handlers, policies, handoffs, and transport composition.

Optional seams are discovered only when their behavior is truly optional. Every behavior-bearing seam has a test or memory layer.
