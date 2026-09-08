# Eval in CI

Catch broken agent wiring before spending money on a live-model eval. This deterministic, no-credential smoke check runs `Agent.run`, asserts the exact answer, and prints `eval passed`. CI typechecks this example; run the command below to execute the assertion locally.

```bash
bun --cwd examples/eval-in-ci start
```

This is a process-local wiring check, not a quality benchmark or a durable recovery test. Add task-specific cases and a live model separately to measure answer quality.
