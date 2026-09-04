---
title: "How to coordinate multiple agents"
description: "Fan out typed child Agents, delegate durable work from a parent model, route through a supervisor, and expose one Agent as a tool."
---

`Agent.fanOut` runs typed children in the current process. `AgentTool.fanOut` gives the parent model the same fan-out shape and, under generalist/runtime, admits addressable child Runs through the existing durable child-group journal. See [Core and Runtime](/learn/native-runtime).

## Context services and run identity are separate channels

A nested child effect evaluates in the current Effect Context, so its service requirements remain ambient. That does not copy values out of the parent's `RunOptions`: child Session identity is an argument to the child call, while transport identity and scheduling remain owned by the transport that launched the parent.

**Parent and child channels**

```text
Parent Agent.run
│
├── Channel 1: Effect Context (inherited by nested child effect)
│   ├── LanguageModel.LanguageModel
│   ├── ToolExecutor / Approvals
│   └── ModelMiddleware and other required services
│
└── AgentTool handler ──▶ Child Agent.run(prompt)
    │
    └── Channel 2: run options / orchestration (not implicitly inherited)
        ├── omitted sessionId means no Session
        └── transport runId, queue, and scheduling remain transport-owned
```

| Value or service              | Owner              | What the child receives                                                                                                                                             |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LanguageModel.LanguageModel` | Effect Context     | The child inherits the ambient model by default; pass a model layer as the `model` option of `AgentTool.asTool` or `Handoff.target` to give the child its own model |
| `ToolExecutor`                | Effect Context     | The ambient optional executor                                                                                                                                       |
| `Approvals`                   | Effect Context     | The ambient optional approval service                                                                                                                               |
| `ModelMiddleware`             | Effect Context     | The ambient optional middleware service                                                                                                                             |
| `sessionId`                   | Child `RunOptions` | Not inherited; omission leaves the child ephemeral, while requesting the active parent's ID fails before model execution                                            |
| `runId`                       | Transport          | Not inherited; a core child invocation does not join the parent's transport run                                                                                     |
| Queue position                | Transport          | Not inherited; the child tool effect does not enter the parent's transport queue                                                                                    |
| Scheduling and run permits    | Transport          | No separate schedule or permit; the scoped child runs while the parent continues to hold its permit                                                                 |

## 1. Fan out child runs

`Agent.fanOut` runs `Agent.child(agent, input)` values concurrently with `Effect.forEach` semantics: explicit bounded concurrency and typed Exit results in input order. Collect keeps one failed Exit in the result; fail-fast interrupts sibling fibers and fails the effect.

**fan-out.ts**

```typescript
import { Console, Effect, Exit, ManagedRuntime } from "effect"
import { Agent, ModelRegistry } from "generalist"
import { layer as deterministicLayer } from "generalist/providers/deterministic"

const planner = Agent.make({ name: "planner" })
const reviewer = Agent.make({ name: "reviewer" })
const model = { provider: "deterministic", model: "multi-agent" }

const program = ModelRegistry.withModel(
  model,
  Agent.fanOut([Agent.child(planner, "Plan the work"), Agent.child(reviewer, "Review the work")] as const, {
    concurrency: 2,
    onFailure: "collect",
  }),
).pipe(
  Effect.flatMap((results) =>
    Console.log(results.map((result) => (Exit.isSuccess(result) ? result.value : "child failed")).join("\n")),
  ),
)

const runtime = ManagedRuntime.make(deterministicLayer({ ...model, response: "deterministic child result" }))
await runtime.runPromise(program)
```

**Output**

```text
deterministic child result
deterministic child result
```

`AgentTool.fanOut({ name, description, agents, maxChildren })` declares a model-callable fan-out without a static handler. Each agent profile fixes its `inherit` policy; the model supplies only the agent selection and input. A Runtime reserves each durable child's share from the parent budget, reports children from `runtime.inspect(parentRunId)`, and reattaches the parent to the same group after restart. Collect encodes child failures for the model; fail-fast requests sibling cancellation and fails the parent.

| Inheritance field | Default       | Choices                         |
| ----------------- | ------------- | ------------------------------- |
| `history`         | `"none"`      | `"none"`, `"summary"`, `"full"` |
| `tools`           | `"attenuate"` | `"attenuate"`, `"same"`         |
| `permissions`     | `"inherit"`   | `"inherit"`, `"fresh"`          |
| `budget`          | Parent share  | Optional narrower limits        |
| `sandbox`         | `"fork"`      | `"share"`, `"fork"`, `"fresh"`  |
| `instructions`    | `"inherit"`   | `"inherit"`, `"own"`            |
| `memory`          | `"inherit"`   | `"inherit"`, `"fresh"`          |

`history: "full"` preserves the exact parent prompt prefix for provider caching. A wider child tool, authorization policy, or sandbox fails before admission with `ChildExceedsParent`. The normalized record is journaled, so recovery reuses the same choices.

## 2. Route through a supervisor

`Handoff.supervisor` builds one `handoff_to_<specialist>` tool per specialist, an agent whose toolkit advertises them, and a handled toolkit for `ToolExecutor.layerToolkit`. The handoff tool is a routing convention: the supervisor's model still decides when to call it.

**supervisor.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Stream } from "effect"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Handoff, ModelMiddleware, Permissions, ToolExecutor } from "generalist"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

let supervisorCalls = 0

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: (options) => {
      const isChildTurn = options.tools.length === 0
      if (isChildTurn) {
        return Stream.make(
          Response.makePart("text-delta", { id: "assistant", delta: "Refund for order 42 issued." }),
          Response.makePart("finish", { reason: "stop", usage, response: undefined }),
        )
      }
      supervisorCalls += 1
      return supervisorCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "route-1",
              name: "handoff_to_billing",
              params: { prompt: "Refund order 42" },
              providerExecuted: false,
            }),
            Response.makePart("finish", { reason: "tool-calls", usage, response: undefined }),
          )
        : Stream.make(
            Response.makePart("text-delta", { id: "assistant", delta: "Billing handled it: refund issued." }),
            Response.makePart("finish", { reason: "stop", usage, response: undefined }),
          )
    },
  }),
)

const billingAgent = Agent.make({ name: "billing", instructions: "Resolve billing requests." })
const billing = Handoff.target(billingAgent)

const supervisor = Handoff.supervisor({
  name: "front-desk",
  instructions: "Route each request to the right specialist.",
  specialists: [billing],
})

const program = Agent.run(supervisor.agent, "I want a refund for order 42.").pipe(
  Effect.flatMap((result) => Console.log(result)),
)

const handlerLayer = supervisor.agent.toolkit.toLayer(
  // SAFETY: every key comes directly from this toolkit's tools and every value has the toolkit handler shape.
  Object.fromEntries(
    Object.keys(supervisor.agent.toolkit.tools).map((name) => [
      name,
      () => Effect.die("ToolExecutor owns handoff tool execution"),
    ]),
  ) as Toolkit.HandlersFrom<typeof supervisor.agent.toolkit.tools>,
)

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerToolkit(supervisor.toolkit),
  handlerLayer,
  supervisor.catalog,
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
Billing handled it: refund issued.
```

<Note title="Handoff registrations close services">
Register each Handoff specialist with Handoff.register(agent, layer) before passing it to a supervisor. The registration provides the agent's required services and maps layer-construction failures to RegistrationError; run options remain explicit and are forwarded unchanged.
</Note>

Specialists inherit the model provided to the supervisor's run. To route one specialist to a different model, pass a closed model layer — for example a provider's `layerModel` over its `layerConfig` client — as the `model` option of `Handoff.target(agent, { model })`. The supervisor keeps the ambient model; only that specialist's turns run on the override. See [How to provide model providers](/guides/providers).

## 3. Expose an agent as a tool

`AgentTool.asTool` is the primitive under both handoff helpers: it wraps an agent in a handled toolkit containing one tool. Defaults are the agent's name, `{ prompt: string }` parameters, and `result` as the output. Override any of them.

Inside the handler the child invocation is `Agent.run(summarizer, prompt)`. The runnable example supplies the model, toolkit handler, executor, permissions, approvals, and middleware with the surrounding `Effect.provide`. Because the child call omits `sessionId`, it has no Session and uses a fresh chat. It does not share the parent's transcript or enter its transport queue. Pass `asTool(child, { model: childModelLayer })` to run the child on a different model than the parent.

**agent-as-tool.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Agent, AgentTool, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Tool, Toolkit } from "effect/unstable/ai"
import { TestModel } from "generalist/testing"

const summarizer = Agent.make({
  name: "summarizer",
  instructions: "Summarize the given text in one sentence.",
})

const summarizeToolkit = AgentTool.asTool(summarizer, {
  name: "summarize",
  description: "Summarize a document in one sentence",
  parameters: Schema.Struct({ document: Schema.String }),
  toPrompt: (params) => `Summarize this: ${params.document}`,
})

const parentToolkit = Toolkit.make(
  Tool.make("summarize", {
    description: "Summarize a document in one sentence",
    parameters: Schema.Struct({ document: Schema.String }),
    success: Schema.String,
    failure: Schema.String,
    failureMode: "return",
  }),
)

const parent = Agent.make({
  name: "editor",
  instructions: "Use the summarize tool before answering.",
  toolkit: parentToolkit,
})

const modelLayer = TestModel.layer([
  TestModel.toolCall("summarize", { document: "Generalist is an Effect-native agent loop." }, { id: "summarize-1" }),
  TestModel.text("Generalist runs agent loops on Effect."),
  TestModel.text("Summary ready: Generalist runs agent loops on Effect."),
])

const program = Agent.run(parent, "Summarize the intro document.").pipe(Effect.flatMap((result) => Console.log(result)))

const runtimeLayer = Layer.mergeAll(
  modelLayer,
  parentToolkit.toLayer({ summarize: () => Effect.die("agent tool bridge handles summarize") }),
  ToolExecutor.layerToolkit(summarizeToolkit).pipe(Layer.provide(modelLayer)),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

const runtime = ManagedRuntime.make(runtimeLayer)
await runtime.runPromise(program)
```

**Output**

```text
Summary ready: Generalist runs agent loops on Effect.
```

- At the tool boundary, child run failures become failed tool results with a string message, so the parent's model can recover.
- Child suspension is collapsed into a failed tool result: a child's `AgentSuspended` does not suspend the parent or create a second suspension protocol ([Suspension as a typed error](/learn/suspension)).

The runnable version of this page is [examples/multi-agent](https://github.com/In-Time-Tec/generalist/tree/main/examples/multi-agent); contracts for `Agent`, `Handoff` and `AgentTool` are in [the context seams reference](/reference/core-context).
