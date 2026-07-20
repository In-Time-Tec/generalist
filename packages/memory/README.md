# `@batonfx/memory`

Focused composition guide for Baton's non-durable memory implementations.

## Install

```sh
bun add effect @batonfx/core @batonfx/memory
```

## Imports

```ts
import { Memory } from "@batonfx/core"
import { WorkingMemory, VectorStore } from "@batonfx/memory"
```

## Layer graph

```text
WorkingMemory.layer({ maxMessages: 4 })
└─ provides Memory.Memory
   ├─ remember transcript by Memory.Key
   └─ recall bounded recent messages
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/memory.ts`](../../examples/package-composition-guides/src/memory.ts)

```ts
import { Console, Effect } from "effect"
import { Prompt } from "effect/unstable/ai"
import { Memory } from "@batonfx/core"
import { WorkingMemory } from "@batonfx/memory"

const key: Memory.Key = { agent: "assistant", subject: "user-42" }
const text = (value: string) => Prompt.makePart("text", { text: value })
const message = (role: "user" | "assistant", value: string) => Prompt.makeMessage(role, { content: [text(value)] })

const program = Memory.Memory.use((memory) =>
  Effect.gen(function* () {
    yield* memory.remember({
      key,
      turn: 0,
      terminal: true,
      transcript: Prompt.fromMessages([message("user", "My name is Ada."), message("assistant", "Hello Ada.")]),
    })
    const recalled = yield* memory.recall({
      key,
      turn: 0,
      prompt: Prompt.fromMessages([message("user", "What do you remember?")]),
    })
    yield* Console.log(`recalled ${recalled.length} messages`)
  }),
).pipe(Effect.provide(WorkingMemory.layer({ maxMessages: 4 })))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/memory.ts`.

## Errors, requirements, and resources

Before provisioning, the program requires `Memory.Memory` and can fail with schema-backed `MemoryError`; `WorkingMemory.layer` discharges the requirement, while retaining that declared production error channel. It succeeds with `void`. The in-process store owns no external resource and bounds each key's recent tail to four messages. Semantic memory additionally uses schema-backed `VectorStoreError`; embedding/vector failures map to `MemoryError`.

## More

- Current behavior: [Memory](../../docs/features/memory.md)
- Deeper example: [memory chat](../../examples/memory-chat/)
- `VectorStore.layerMemory` provides the non-durable in-memory vector store; `layerCombined` is unchanged.

### Working-memory summaries

Provide a dedicated summary model through Effect layer composition:

```ts
import { Layer } from "effect"
import { WorkingMemory } from "@batonfx/memory"

const memoryLayer = WorkingMemory.layer({
  maxMessages: 20,
  summarize: {},
}).pipe(Layer.provide(WorkingMemory.layerSummaryModel.pipe(Layer.provide(modelLayer))))
```

The summary model is acquired once in the memory layer's owning scope and reused across overflows. It is composed through `layerSummaryModel` as shown above.
