# Agent loop

`@batonfx/core` runs a non-durable model-turn loop over Effect AI `Prompt`, `Response`, `Chat`, tools, and language models. Turn zero always runs. Later turns run only while the turn policy continues with pending tool results. The default policy is `TurnPolicy.forever`: the loop continues until a turn leaves no pending tool results, and a follow-up cap is an explicit author choice via `TurnPolicy.recurs(n)`.

- Middleware-transformed response parts are authoritative for events, history, tools, memory, sessions, and compaction.
- Transformed tool-call ids must be unique within one model response. A duplicate fails before that call starts work.
- Framework tool results enter Chat once, in call order, before session sync, memory retention, policy evaluation, persistence, and `TurnCompleted`.
- Framework tool calls run serially by default. `Agent.make({ toolExecution: { concurrency: n } })` allows at most `n` calls from one model turn to execute together while events, results, and checkpoints stay in provider call order. Provider-executed calls are never run locally.
- Declared tool failures remain schema-valid domain results. Routing, schema, handler-boundary, placement, and authorization failures terminate through typed `FrameworkFailure` values.
- A policy stop with pending results is typed. It never silently drops results.
- Ordinary and persisted runs are separate entrypoints; persisted runs require Effect AI `Chat.Persistence`.
- Agent requirements remain visible through model selection, memory, tool handlers, policies, handoffs, and transport composition.

Optional seams are discovered only when their behavior is truly optional. Every behavior-bearing seam has a test or memory layer.
