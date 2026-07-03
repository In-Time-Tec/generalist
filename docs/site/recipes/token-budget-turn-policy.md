# Token-Budget TurnPolicy

`TurnPolicy` is a plain value carried by an agent. Use `TurnPolicy.recurs(n)` for fixed maximum recursion, `TurnPolicy.untilToolCall(name)` for task-specific stopping, or `TurnPolicy.both` to combine constraints.

Token-budget policies should be plain values too. If the policy depends on provider metadata, read that metadata before constructing the agent and keep the loop service set unchanged.
