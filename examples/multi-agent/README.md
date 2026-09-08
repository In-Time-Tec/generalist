# Multi-Agent

Run independent planning and review work side by side instead of waiting for one agent before starting the other. This example uses `Agent.fanOut` to run two typed child agents with concurrency set to two and collects their outcomes.

```bash
bun --cwd examples/multi-agent start
```

Expect two `deterministic child result` lines. The credential-free provider returns scripted text: this demonstrates concurrent composition, not useful planning or independent review. Both agents run locally without a durable Runtime.
