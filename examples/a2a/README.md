# A2A

This offline example runs two Generalist hosts in one process. Agent A calls its delegation tool, the tool sends an A2A v1 message through Generalist's SDK handler, and Agent B's Runtime run returns the artifact that Agent A uses in its answer.

```bash
bun run --cwd packages/generalist build
bun run --cwd examples/a2a start
```

The example calls the transport-neutral A2A handler directly; a deployment mounts the same handler in an A2A SDK transport. For live-provider mode, replace `hostModel` and `agentBModel` in `src/index.ts` with provider Layers, configure that provider's credentials, and instruct Agent A to call `delegate_to_agent_b` when another agent should own the request. The A2A and Host wiring stays unchanged.
