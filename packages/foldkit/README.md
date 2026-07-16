# `@batonfx/foldkit`

Focused composition guide for the FoldKit adapter to Baton transport sessions.

## Install

```sh
bun add effect foldkit @batonfx/foldkit
```

## Imports

Import the public namespace from the package root:

```ts
import { Connection } from "@batonfx/foldkit"
```

## Layer graph

```text
Connection.testLayer
└─ provides Connection.AgentConnection
   └─ session acquisition requires Scope
      └─ program closes it with Effect.scoped
```

`testLayer` is a deterministic adapter for examples and tests. Production applications provide an `AgentConnection` backed by a Baton transport client; they do not use this synthetic frame stream.

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/foldkit.ts`](../../examples/package-composition-guides/src/foldkit.ts)

```ts
import { Console, Effect, Stream } from "effect"
import { Connection } from "@batonfx/foldkit"

const connectionLayer = Connection.testLayer({
  frames: () => Stream.make(Connection.ConnectionOpened()),
  send: () => Effect.void,
})

const program = Connection.AgentConnection.use((connection) =>
  Effect.scoped(
    Effect.gen(function* () {
      const session = yield* connection.session({ sessionId: "guide-session" })
      const frames = yield* Stream.runCollect(session.frames)
      yield* Console.log(`received ${frames.length} connection event`)
    }),
  ),
).pipe(Effect.provide(connectionLayer))

await Effect.runPromise(program)
```

From the repository root, run `bun examples/package-composition-guides/src/foldkit.ts`.

## Errors, requirements, and resources

The fully provided program has type-level result `Effect<void, never, never>` and prints one received event. `Effect.scoped` delimits the session lifetime and discharges its `Scope` requirement; this test adapter has no release action, while production scoped connections release their transport resources. Production command writes can fail with schema-backed `Connection.SendFailed`; the test sender cannot fail. This example owns one session, allocates no queue, and creates no timers, detached fibers, or concurrent work.

## More

- Current behavior: [FoldKit adapter](../../docs/features/foldkit.md)
- Deeper example: [deep research agent](../../examples/deep-research-agent/)
- Existing custom `AgentConnection` providers must implement the scoped `session` acquisition; `testLayer` remains a compatibility adapter for legacy test implementations.
