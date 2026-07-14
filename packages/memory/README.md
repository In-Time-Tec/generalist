# `@batonfx/memory`

Non-durable memory implementations for Baton agents.

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
