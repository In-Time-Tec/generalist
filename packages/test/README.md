# `@batonfx/test`

Focused composition guide for deterministic scripted language-model fixtures.

## Install

```sh
bun add effect @batonfx/core @batonfx/test
```

## Imports

```ts
import { TestModel } from "@batonfx/test"
```

## Layer graph

```text
TestModel.layer(script)
└─ provides LanguageModel
   └─ Agent.generate consumes one scripted step
```

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/test.ts`](../../examples/package-composition-guides/src/test.ts)

```ts
import { Console, Effect } from "effect"
import { Agent } from "@batonfx/core"
import { TestModel } from "@batonfx/test"

const modelLayer = TestModel.layer([TestModel.text("A deterministic answer.")])
const agent = Agent.make({ name: "tested-agent" })

const program = Agent.generate(agent, { prompt: "Answer deterministically." }).pipe(
  Effect.flatMap((result) => Console.log(result.text)),
  Effect.provide(modelLayer),
)

await Effect.runPromise(program)
```

Run `bun examples/package-composition-guides/src/test.ts`.

## Errors, requirements, and resources

The model layer discharges `LanguageModel`, leaving `R = never`; success is `void`, and failures remain the agent's schema-backed `RunError` union. Script exhaustion or operation mismatch enters through Effect AI's typed `AiError` and is mapped by the agent. The fixture atomically claims slots from a finite FIFO script and captures every request; concurrent callers claim unique slots. This bounded one-step run records exactly one request and has no resource scope, timers, detached fibers, or concurrent work.

## More

- Current behavior: [Test kit](../../docs/features/test-kit.md)
- Deeper example: [eval in CI](../../examples/eval-in-ci/)
