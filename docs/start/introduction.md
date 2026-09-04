---
title: "What is Generalist"
description: "Learn what Generalist adds to Effect AI, when to use the local loop or durable Runtime, and where to go next."
---

Generalist helps you build AI agents as part of an Effect application. It builds on `effect/unstable/ai` and adds the loop around a model call: run tools, continue for another turn, ask for approval, and emit events your application can consume.

An agent is a plain value containing a name, instructions, a toolkit, and a turn policy. The model and tool handlers are Effect layers, so production providers and deterministic test providers can run the same agent program.

## A complete program

This runs an agent against the deterministic provider and asserts on its answer: no API key, exit code 0 on success.

**eval.ts**

```typescript
import { Console, Effect } from "effect"
import { Agent } from "generalist"
import { layerModel as deterministicModel } from "generalist/providers/deterministic"

const agent = Agent.make({ name: "eval-agent" })

const program = Effect.gen(function* () {
  const result = yield* Agent.run(agent, "Say the deterministic answer.").pipe(Effect.provide(deterministicModel()))
  if (result !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result}`)
  }
  yield* Console.log("eval passed")
})

await Effect.runPromise(program)
```

**Output**

```text
eval passed
```

## When to use Generalist

- Use the process-local loop for CLIs, scripts, servers, and tests that do not need external infrastructure.
- Use typed suspension when a tool needs a person or another system to approve it before execution.
- Add generalist/runtime when a run must be addressable, survive a restart, or resume later.
- Use scripted models and test layers to check agent behavior in CI without credentials.

## Non-goals

Generalist is not a general-purpose workflow engine, project scaffold, or hosted platform. generalist/runtime owns agent-run durability and storage adapters; wider application orchestration and deployment remain yours.

## Where generalist/runtime fits

The core package runs an agent in the current process. generalist/runtime adds persisted events, waits and signals, cancellation, inspection, and recovery. Use its memory layer for local development, SQLite for durable single-process execution, or PostgreSQL/MySQL for multiple workers. [Core and Runtime: where durability lives](/learn/native-runtime) covers the package boundary in depth.

## Next steps

- New here? Run a tool-calling agent without an API key: [Offline quickstart](/start/quickstart).
- Connecting this to an existing project? Check versions and optional peers: [Installation](/start/installation).
- After the quickstart, learn why the event sequence looks that way: [The agent loop](/learn/agent-loop).
