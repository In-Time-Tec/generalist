# `@batonfx/memory`

Non-durable memory implementations for Baton agents.

## Working-memory summaries

Provide a dedicated summary model through Effect layer composition:

```ts
import { Layer } from "effect"
import { WorkingMemory } from "@batonfx/memory"

const memoryLayer = WorkingMemory.layer({
  maxMessages: 20,
  summarize: {},
}).pipe(Layer.provide(WorkingMemory.summaryModelLayer.pipe(Layer.provide(modelLayer))))
```

The summary model is acquired once in `memoryLayer`'s owning scope and reused across overflows. The former `summarize: { model: modelLayer }` option remains supported but is deprecated; migrate by composing the model through `summaryModelLayer` as shown above.

See the [Baton documentation](https://github.com/In-Time-Tec/batonfx#readme) for installation, examples, and API guidance.

## Imports and migration

Import implementation namespaces from the package root:

```ts
import { VectorStore } from "@batonfx/memory"

const store = VectorStore.layerMemory
```

`VectorStore.memoryLayer` remains an exact deprecated alias during the deprecation window. It will not be removed before 1.0.0 and only in a separately planned major release.

| Compatibility name        | Canonical name            |
| ------------------------- | ------------------------- |
| `VectorStore.memoryLayer` | `VectorStore.layerMemory` |

The package-level `combinedLayer` composition factory is unchanged.
