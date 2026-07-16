# `@batonfx/skills`

Focused composition guide for filesystem and hosted skill sources.

## Install

```sh
bun add effect @effect/platform-bun @batonfx/core @batonfx/skills
```

## Imports

```ts
import { SkillSource } from "@batonfx/core"
import { SkillLoader } from "@batonfx/skills"
```

## Layer graph

```text
BunServices.layer
└─ provides FileSystem + Path
   └─ SkillLoader.layer({ roots: [] })
      └─ provides SkillSource.SkillSource
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/skills.ts`](../../examples/package-composition-guides/src/skills.ts)

```ts
import { Console, Effect, Layer } from "effect"
import { BunServices } from "@effect/platform-bun"
import { SkillSource } from "@batonfx/core"
import { SkillLoader } from "@batonfx/skills"

const skillLayer = SkillLoader.layer({ roots: [] }).pipe(Layer.provide(BunServices.layer))

const program = SkillSource.SkillSource.use((source) =>
  source.all.pipe(Effect.flatMap((skills) => Console.log(`discovered ${skills.length} skills`))),
).pipe(Effect.provide(skillLayer))

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/skills.ts`.

## Errors, requirements, and resources

`BunServices.layer` provides the `FileSystem` and `Path` requirements used by `SkillLoader.layer`; the composed program has `R = never`, succeeds with `void`, and retains schema-backed `SkillSourceError` for filesystem, parsing, path, and validation failures. The layer owns platform services; this empty-root run performs no concurrent work and uses no timers, detached fibers, or unbounded buffers.

## More

- Current behavior: [Instructions and skills](../../docs/features/instructions-and-skills.md)
- Deeper example: [capstone local assistant](../../examples/capstone-local-assistant/)
