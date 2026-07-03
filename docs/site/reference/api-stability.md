# API Stability

Baton `0.1.0` publishes the seven `@batonfx/*` packages as a coordinated train.

All public exports carry `@experimental` while `effect/unstable/ai` is itself unstable. The stable tier for `0.1.x` is conceptual: the `AgentEvent` union, frozen error tags, `Agent`, `ToolExecutor`, `Approvals`, and `TurnPolicy` are the small stable core. Everything else is experimental and may move before `1.0.0`.

`1.0.0` waits for Effect 4 GA. Until then, each Baton `0.x` minor declares the tested `effect@4.0.0-beta.*` catalog version in the root README.
