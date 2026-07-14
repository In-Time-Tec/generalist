# @batonfx/core

Baton is a standalone, **non-durable**, Effect-native agent loop over `effect/unstable/ai`. Baton is the agent; [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it with Relay when you need durability.

See [`docs/spec/01-baton-agent-framework.md`](../../docs/spec/01-baton-agent-framework.md) for the full contract.

## Imports and Layers

Import intentional namespaces from the package root. Service Layer variants use a noun after `layer`:

```ts
import { Layer } from "effect"
import { Memory, ModelMiddleware, Session, ToolOutput } from "@batonfx/core"

const services = Layer.mergeAll(
  Memory.layerNoop,
  ModelMiddleware.layerIdentity,
  Session.layerMemory,
  ToolOutput.layerMemory,
)
```

Existing names remain exact aliases during the deprecation window. They will not be removed before 1.0.0 and only in a separately planned major release.

| Compatibility name              | Canonical name                  |
| ------------------------------- | ------------------------------- |
| `Memory.noopLayer`              | `Memory.layerNoop`              |
| `ModelMiddleware.identityLayer` | `ModelMiddleware.layerIdentity` |
| `Session.memoryLayer`           | `Session.layerMemory`           |
| `ModelRegistry.memoryLayer`     | `ModelRegistry.layerMemory`     |

`layerIdentity` means a transformation that preserves input. `layerNoop` means service operations deliberately take no meaningful action.

## Memory item content

`Memory.Item.content` accepts only Effect AI user-message parts: text and files. Protocol transcript parts such as reasoning, tool calls/results, and approval parts cannot be recalled as memory items.

```ts
import { Array } from "effect"
import { Memory, Prompt } from "@batonfx/core"

const item: Memory.Item = {
  id: "fact-1",
  content: [Prompt.makePart("text", { text: "prefers dark mode" })],
}

const migrated: Memory.Item = {
  id: legacy.id,
  content: Array.getSomes(legacy.parts.map(Memory.itemFromPromptPart)),
}
```

This is a breaking correction from the former `parts: ReadonlyArray<Prompt.Part>` field. Rename `parts` to `content`; when legacy storage contains broad prompt parts, use `Memory.itemFromPromptPart` to filter them explicitly or reject the legacy item if any conversion returns `Option.none`. Baton never converts protocol parts to lossy text.

## Tool execution placement

Baton uses Effect AI `Tool` and `Toolkit` values directly. For ordinary in-process tools, provide the handler layer from `toolkit.toLayer(...)` and no `ToolExecutor` is required. `ToolExecutor` is the optional override seam for durable waits and external placement. Its route helpers keep placement explicit while reusing the same toolkit definitions:

```ts
import { Effect } from "effect"
import { ToolExecutor } from "@batonfx/core"

const executorLayer = ToolExecutor.router([
  ToolExecutor.remote({
    toolkit,
    execute: ({ call }) =>
      remoteWorker.call(call.name, call.params).pipe(Effect.map((result) => ({ _tag: "Success", result }))),
  }),
])
```

## Chat persistence (standalone conversation history)

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone app has no conversation continuity between runs. Set `RunOptions.persistence` to run the loop on a **persisted** chat instead: the chat identified by `chatId` is created on first use and accumulates history across runs.

Baton adds no storage of its own — it delegates entirely to `effect/unstable/ai`'s `Chat.Persistence`. Provide it with an upstream `Chat.layerPersisted` over any `BackingPersistence` layer.

```ts
import { Effect, Layer } from "effect"
import { Persistence } from "effect/unstable/persistence"
import { Agent, Chat } from "@batonfx/core"

// A memory-backed persistence stack for a standalone chat app.
const persistenceLayer = Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)
// Or SQL-backed on the app's own database (requires a SqlClient in context):
//   Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
//     Layer.provide(Persistence.layerBackingSql),
//   )

const agent = Agent.make("assistant", { instructions: "You are a helpful assistant." })

// Run 1 and run 2 share the same chatId, so run 2 sees run 1's history.
const program = Effect.gen(function* () {
  const first = yield* Agent.generate(agent, {
    prompt: "My name is Ada.",
    persistence: { chatId: "user-42" },
  })
  const second = yield* Agent.generate(agent, {
    prompt: "What is my name?",
    persistence: { chatId: "user-42" },
  })
  return [first.text, second.text]
}).pipe(Effect.provide(persistenceLayer))
```

Notes:

- `Chat.Persistence` is resolved **optionally**, so `persistence` set without the layer in context fails immediately with `AgentError` — misconfiguration is loud.
- `RunOptions.history` (an in-memory transcript) and `persistence` are mutually exclusive.
- On a persisted chat the agent's system message is stored once on the first run and not re-added on subsequent runs.
