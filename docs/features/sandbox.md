# Sandboxes

`generalist/sandbox` is the provider-neutral code-execution seam. Generalist defines the capability and lifecycle contract; applications and ecosystem packages supply production isolation adapters.

## Contract

```ts
import { Duration, Effect } from "effect"
import * as Sandbox from "generalist/sandbox"

const program = Effect.scoped(
  Effect.gen(function* () {
    const provider = yield* Sandbox.SandboxProvider
    const sandbox = yield* provider.acquire({
      image: provider.defaultImage,
      key: "session-42",
      limits: { wallClock: Duration.seconds(30) },
    })

    return yield* sandbox.exec({
      _tag: "Process",
      command: "bun",
      arguments: ["test"],
    })
  }),
)
```

`acquire` requires `Scope`; the caller owns release. `key` asks a stateful provider for the same logical sandbox, while `image` selects an immutable provider image. `start` exposes an ordered event stream plus a terminal result; `exec` collects the result and `stream` exposes events.

The command vocabulary is explicit. A provider supports only the command kinds and lifecycle operations listed in its `capabilities`; unsupported operations fail with typed `Unsupported`. Generalist never guesses how to translate a process, TypeScript cell, or module invocation.

## First-party implementations

Generalist keeps trusted local implementations used to develop and test the contract:

- the Bun kernel executes stateful TypeScript cells in a host process;
- the worktree provider executes processes against temporary Git worktrees.

These are process boundaries, not security boundaries. They share the host operating-system identity and make no container, microVM, billing, or multi-tenant isolation claim.

Production container, microVM, isolate, and hosted workspace adapters belong outside Generalist. They implement `SandboxProvider` and can be distributed, versioned, and qualified independently.

## Snapshots and durable runs

`snapshot` returns an immutable `SnapshotId`. `fork(snapshotId)` creates a new sandbox namespace from that image. Runtime may retain snapshot evidence alongside a tool completion, but the Runtime journal, operations, Session entries, and child records remain canonical authority. A sandbox snapshot is working state, not a substitute for durable execution state.

## Errors

The closed boundary failures are:

- `Unsupported`: the provider does not implement the operation or requested limit;
- `Unavailable`: acquisition or connectivity failed before execution;
- `ExecutionFailed`: an admitted command failed;
- `LimitExceeded`: an enforced resource limit stopped work;
- `SnapshotNotFound`: the immutable image does not exist in that provider.

## Qualifying an external adapter

```ts
import { Testing } from "generalist/testing"
import { layerMySandbox } from "my-generalist-sandbox"

Testing.sandbox({
  name: "My Sandbox",
  isolation: "container",
  layer: layerMySandbox,
})
```

The shared suite checks command round-trip, streaming, files, pause/resume retention, snapshot/fork isolation, limit enforcement, factual isolation labels, and typed unsupported behavior. Run it in the adapter's own package against the real provider configuration being claimed.

## Related

- Contract: `packages/generalist/src/sandbox/`
- Local adapters: `packages/generalist/src/repl/`
- Conformance: `packages/generalist/src/testing/sandbox.ts`
