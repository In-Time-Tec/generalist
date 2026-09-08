---
title: "What is Generalist"
description: "Turn disposable agent sessions into durable workers, or use the Effect agent loop without storage."
---

An agent can take several turns, wait for a person, and call a service before its task is done. If that work lives only in a process, a restart loses the session. Generalist turns disposable agent sessions into durable workers by recording accepted work in an optional object-backed Runtime.

The same agent can also run locally without storage. Built on `effect/unstable/ai`, the core calls models, runs tools, asks for approval, and emits events your application can consume. Start there when a script or request doesn't need restart recovery.

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

Generalist is not a general-purpose workflow engine, project scaffold, or hosted platform. The Runtime owns agent-run recovery; wider application orchestration, authentication, authorization, and deployment remain yours.

## Where generalist/runtime fits

The core package runs an agent in the current process. generalist/runtime adds persisted events, waits and signals, cancellation, inspection, and recovery. Use the shared object-storage engine through S3 or native R2 when work must survive restart. Local processes, servers, Cloudflare Durable Objects, and Rivet actors host that same engine; there is no production memory, filesystem, or SQL Runtime. [Core and Runtime: where durability lives](/learn/native-runtime) covers the package boundary in depth.

Commands serialize within a partition, not globally. Recovery uses recorded outcomes; when an external action may have happened but its result is unknown, it requires resolution instead of blindly repeating the action. This is not an exactly-once guarantee for external services.

Local MinIO and Miniflare/workerd qualification is not live AWS S3 or deployed R2 certification. Local performance measurements do not establish production latency or throughput guarantees.

## Next steps

- New here? Run a tool-calling agent without an API key: [Offline quickstart](/start/quickstart).
- Connecting this to an existing project? Check versions and optional peers: [Installation](/start/installation).
- After the quickstart, learn why the event sequence looks that way: [The agent loop](/learn/agent-loop).
