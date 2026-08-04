# Keep Runtime outside core

`@batonfx/core` owns the process-local agent loop and depends only on Effect. `@batonfx/runtime` composes core behind addressable Runs, durable logs, claims, waits, and recovery. Keeping that boundary lets applications use the agent as an ordinary Effect library without a database while giving durable hosts one Baton-owned execution contract instead of a parallel runtime.
