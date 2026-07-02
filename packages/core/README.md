# @batonfx/core

Baton is a standalone, **non-durable**, Effect-native agent loop over `effect/unstable/ai`. Baton is the agent; [Relay](https://github.com/In-Time-Tec/relayfx) is the durable race it runs in. Use Baton alone when you just need an agent or chat streaming; compose it with Relay when you need durability.

See [`docs/spec/01-baton-agent-framework.md`](../../docs/spec/01-baton-agent-framework.md) for the full contract.

## Chat persistence (standalone conversation history)

Baton's loop builds its `Ai.Chat` internally and discards it when the run ends, so a standalone app has no conversation continuity between runs. Set `RunOptions.persistence` to run the loop on a **persisted** chat instead: the chat identified by `chatId` is created on first use and accumulates history across runs.

Baton adds no storage of its own — it delegates entirely to `effect/unstable/ai`'s `Chat.Persistence`. Provide it with an upstream `Chat.layerPersisted` over any `BackingPersistence` layer.

```ts
import { Effect, Layer } from "effect"
import * as Ai from "effect/unstable/ai"
import { Persistence } from "effect/unstable/persistence"
import { Agent } from "@batonfx/core"

// A memory-backed persistence stack for a standalone chat app.
const persistenceLayer = Ai.Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
  Layer.provide(Persistence.layerBackingMemory),
)
// Or SQL-backed on the app's own database (requires a SqlClient in context):
//   Ai.Chat.layerPersisted({ storeId: "my-app-chats" }).pipe(
//     Layer.provide(Persistence.layerBackingSql),
//   )

const agent = Agent.make({ name: "assistant", instructions: "You are a helpful assistant." })

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
