---
title: "Seams as services"
description: "One required model service, optional seams discovered at run time, and a test layer for every behavior-bearing seam."
---

Generalist has no plugin API. Every extension point is an Effect service, and a plugin is a `Layer`. That one decision splits the framework's surface into two tiers: the model service a run cannot start without, handler layers required by the tools you attach, and optional seams the loop discovers at run time with `Effect.serviceOption`.

## The required service

The requirement is written in the type. `Agent.stream` always needs a `LanguageModel` in context. Tool handler layers are required only for the toolkit calls the model can make:

| Layer                              | What it decides                        | When you provide it                                                                                       |
| ---------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Ai.LanguageModel.LanguageModel`   | Which model answers each turn          | Always                                                                                                    |
| `toolkit.toLayer({ ...handlers })` | How in-process Effect AI tools execute | When the agent advertises tools with local handlers                                                       |
| `ToolExecutor.ToolExecutor`        | Where externally placed tools execute  | Only when overriding local toolkit handlers for durable waits, clients, remote workers, MCP, or sandboxes |

An agent with no tools can run with only a model layer:

**four-layers.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent } from "generalist"
import { TestModel } from "generalist/testing"

const agent = Agent.make({
  name: "minimal-agent",
  instructions: "Reply briefly.",
})

const modelLayer = TestModel.layer([TestModel.text("One required layer, nothing else.")])

const layers = Layer.mergeAll(modelLayer)

const program = Agent.run(agent, "Are you fully configured?").pipe(Effect.flatMap((result) => Console.log(result)))

const runtime = ManagedRuntime.make(layers)
await runtime.runPromise(program)
```

**Output**

```text
One required layer, nothing else.
```

## Optional seams, discovered not demanded

Everything else is optional. At run start the loop probes for each seam with `Effect.serviceOption` and takes the default path when the service is absent: `Instructions`, `SkillCatalog`, `Permissions`, `Steering`, `Compaction`, `Memory`, `Session.SessionDirectory`, `ModelResilience`, `Store`, `Approvals`, `ModelMiddleware`, `Ai.Tokenizer.Tokenizer`.

Absent means default, and default means the documented base behavior, exactly. No `Permissions` layer means tools run under the ordinary approval path; no `Compaction` means context is never rewritten; no `Memory` means nothing is recalled or remembered. Your application pays for the seams it uses and never configures the ones it does not. The guides for [permissions](/guides/permissions), [memory](/guides/memory), and [compaction](/guides/compaction) each show a single layer switching the behavior on.

## Every seam ships a test layer

A repository invariant backs the pattern: every behavior-bearing seam exposes a `layerTest` or memory layer. `ToolExecutor.layerTest` scripts tool outcomes, `Approvals.layerTest` scripts decisions, `Session.layerMemory` keeps independent per-session event logs in keyed `Ref` cells, and a scripted `Ai.LanguageModel.make` stands in for the model itself. Tests and CI evals swap implementations through layers alone: the run under test is the production code path with different providers, which is how [agents are tested and evaled in CI](/guides/testing-evals) without an API key.

## Why this makes Generalist embeddable

Because every seam is a service, a host can replace any of them without core importing host code. An in-process CLI provides a model and the handler layers for its local tools. generalist/runtime provides the same model/tool surface plus durable implementations of execution concerns (a database-backed `SessionDirectory`, a blob-backed `Store`, persisted RunEvents, wait-backed approvals) and the loop cannot tell the difference. That native composition is the subject of [Core and Runtime: where durability lives](/learn/native-runtime).
