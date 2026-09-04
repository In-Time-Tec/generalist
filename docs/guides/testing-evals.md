---
title: "How to test agents and run evals in CI"
description: "Pin loop behavior with scripted models and layerTests, then gate CI on a deterministic eval, with no API keys anywhere."
---

Every behavior-bearing seam in Generalist is an Effect service with an in-memory `layerTest`, so a full tool-calling loop runs in CI with zero credentials ([Seams as services](/learn/seams-as-services)). Keep the primary pass/fail deterministic; add LLM-judge jobs outside the default CI path if you want them.

## 1. Script the model and pin the loop

A scripted `TestModel.make` fixture decides each turn: a tool call on the first request, the final answer on the second. Its normalized prompt capture proves the tool result was re-fed, while the handler assertion pins the tool arguments the model produced.

**scripted-loop-test.ts**

```typescript
import { Console, Effect, Equal, Layer, Schema } from "effect"
import { Agent, Approvals, Permissions } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))

const lookupTool = Tool.make("lookup_order", {
  description: "Look up an order by id",
  parameters: Schema.Struct({ orderId: Schema.String }),
  success: Schema.String,
})

const toolkit = Toolkit.make(lookupTool)

const agent = Agent.make({
  name: "support-agent",
  instructions: "Answer using the order data returned by tools.",
  toolkit,
})

const executedCalls: Array<unknown> = []

const program = Effect.gen(function* () {
  const fixture = yield* TestModel.make([
    TestModel.toolCall("lookup_order", { orderId: "42" }, { id: "lookup-1" }),
    TestModel.text("Order 42 shipped yesterday."),
  ])
  const result = yield* Effect.scoped(
    Effect.flatMap(
      Layer.build(
        fixture.layer.pipe(
          Layer.provideMerge(
            Layer.mergeAll(
              toolkit.toLayer({
                lookup_order: (params) =>
                  Effect.sync(() => {
                    executedCalls.push(params)
                    return "shipped yesterday"
                  }),
              }),
              Permissions.layerAllowAll,
              Approvals.layerAutoApprove,
            ),
          ),
        ),
      ),
      (services) => Agent.run(agent, "Where is order 42?").pipe(Effect.provideContext(services)),
    ),
  )
  if (result !== "Order 42 shipped yesterday.") {
    return yield* Effect.die(`unexpected answer: ${result}`)
  }
  if (!Equal.equals(executedCalls, [{ orderId: "42" }])) {
    return yield* Effect.die(`unexpected tool params: ${encodeJson(executedCalls)}`)
  }
  if (!encodeJson(yield* fixture.prompts).includes("shipped yesterday")) {
    return yield* Effect.die("tool result was not re-fed to the model")
  }
  yield* Console.log("scripted loop test passed")
})

await Effect.runPromise(program)
```

**Output**

```text
scripted loop test passed
```

The same layers drop into any test runner: wrap the program in `it.effect` from `@effect/vitest` instead of `Effect.runPromise` and assert with `expect`.

## 2. Swap any seam with its layerTest

| Seam                                           | Test construction                                                                                           |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `Ai.LanguageModel`                             | `TestModel.layer` or a stateful `TestModel.make` fixture                                                    |
| `ToolExecutor`                                 | `ToolExecutor.layerTest({ execute })`                                                                       |
| `Approvals`                                    | `Approvals.layerAutoApprove`, `Approvals.layerDenyAll`, or `Approvals.layerTest` returning `Pending` tokens |
| `ModelMiddleware`                              | `ModelMiddleware.layerIdentity`                                                                             |
| `ModelRegistry`                                | `Deterministic.layer` registration                                                                          |
| `Steering`, `ModelResilience`, `Connection`, … | every optional seam ships its own `layerTest(implementation)`                                               |

## 3. Gate CI on a deterministic eval

For an eval binary, select the deterministic registration through the same `ModelRegistry.withModel` pattern used for real providers. Swapping in OpenRouter later changes the selection and the layer, nothing else ([How to provide model providers](/guides/providers)). This is [examples/eval-in-ci](https://github.com/In-Time-Tec/generalist/tree/main/examples/eval-in-ci) verbatim.

**eval.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime } from "effect"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, Permissions, ToolExecutor } from "generalist"
import { layer as deterministicLayer } from "generalist/providers/deterministic"

const agent = Agent.make({ name: "eval-agent" })

const program = Effect.gen(function* () {
  const result = yield* ModelRegistry.withModel(
    { provider: "deterministic", model: "local" },
    Agent.run(agent, "Say the deterministic answer."),
  )
  if (result !== "deterministic response") {
    return yield* Effect.die(`Unexpected eval output: ${result}`)
  }
  yield* Console.log("eval passed")
})

const runtimeLayer = Layer.mergeAll(
  deterministicLayer({ model: "local" }),
  ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
eval passed
```

**Terminal**

```bash
bun run eval.ts
```

- On success the script prints `eval passed` and exits 0; on a mismatch `Effect.die` rejects the promise and the process exits non-zero, which is exactly what a CI step needs.
- Never provide `Deterministic.layer()` where a `LanguageModel` is required: it registers a model in the `ModelRegistry`; `ModelRegistry.withModel` supplies the actual model per run.

If you have not built the loop this page tests, start with [the quickstart](/start/quickstart); its final step is this eval.
