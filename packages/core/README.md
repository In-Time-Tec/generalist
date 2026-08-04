# `@batonfx/core`

Focused composition guide for Baton's standalone, non-durable Effect-native agent loop.

## Install

```sh
bun add effect @batonfx/core @batonfx/test
```

## Imports

Import intentional public namespaces from the package root:

```ts
import { Agent, Chat, Memory, ModelMiddleware, Session, ToolOutput } from "@batonfx/core"
```

## Runnable program

Run the checked [`package-composition-guides/src/core.ts`](../../examples/package-composition-guides/src/core.ts) example. It composes `Agent.layerRuntime`, a `LanguageModel`, and optional `Chat.Persistence`, then executes once at the application boundary.

## Errors, requirements, and resources

The merged layer discharges `Agent.Runtime`, `Chat.Persistence`, and `LanguageModel`. Failures remain in `Agent.RunError`, requirements remain visible until provided, and scoped resources are owned by their layers. `history` and `persistence` are mutually exclusive.

## More

- Current behavior: [Agent loop](../../docs/features/agent-loop.md)
- Deeper examples: [tool-calling chatbot](../../examples/tool-calling-chatbot/) and [memory chat](../../examples/memory-chat/)
- Baton uses Effect AI `Tool` and `Toolkit` directly; optional `ToolExecutor` handles external or durable placement.
- Persisted chat uses `Chat.Persistence`; reusing a `chatId` carries history across runs. It requires `Agent.Runtime` and `Chat.Persistence`.
- `Memory.Item.content` accepts Effect AI user text and file parts; protocol transcript parts are excluded from recall.
- Sibling framework tool calls are serial by default. Set `toolExecution.concurrency` on the Agent for bounded or unbounded concurrency; results still checkpoint in provider call order.
- `ToolExecutor.execute` returns `Success | DomainFailure | Suspend`; framework routing, placement, authorization, and schema failures remain typed Effect failures.
- `TurnPolicy.forever` is the default. Use `TurnPolicy.recurs(n)` for an explicit follow-up bound or `TurnPolicy.make` for a service-dependent policy.
