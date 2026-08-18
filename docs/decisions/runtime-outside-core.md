# Keep Runtime outside core

`tenetkit` owns the process-local agent loop and depends only on Effect. `tenetkit/runtime` composes core behind addressable Runs, durable logs, claims, waits, and recovery. Keeping that boundary lets applications use the agent as an ordinary Effect library without a database while giving durable hosts one TenetKit-owned execution contract instead of a parallel runtime.
