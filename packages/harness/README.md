# `@batonfx/harness`

Focused composition guide for the continual harness engine: versioned prompt, memory, skill, and subagent entries plus audited refinements.

## Install

```sh
bun add effect @batonfx/core @batonfx/harness
```

## Imports

```ts
import {
  HarnessMerge,
  HarnessOverview,
  HarnessSnapshot,
  HarnessState,
  HarnessStore,
  Refinement,
} from "@batonfx/harness"
```

## Layer graph

```text
HarnessStore.layerMemory
└─ provides HarnessStore.HarnessStore
   ├─ load(scope) -> HarnessState
   └─ save(state)

BunServices.layer
└─ provides FileSystem + Path
   └─ FileSystemHarnessStore.layer({ path })
      └─ provides HarnessStore.HarnessStore
```

`layerMemory` is the in-process store. `FileSystemHarnessStore.layer` is the durable store: the host owns every location through `path(scope)`, the package owns encoding and atomicity.

## Runnable program

Checked source: [`../../examples/package-composition-guides/src/harness.ts`](../../examples/package-composition-guides/src/harness.ts)

```ts
import { Console, Effect, ManagedRuntime, Result } from "effect"
import { HarnessOverview, HarnessStore, Refinement } from "@batonfx/harness"

const program = HarnessStore.HarnessStore.use((store) =>
  Effect.gen(function* () {
    const state = yield* store.load("thread:demo")
    const result = Refinement.applyProposal(state, {
      id: "proposal-1",
      at: "2024-01-01T00:00:00.000Z",
      rationale: "record one durable preference",
      edits: [
        {
          _tag: "Create",
          kind: "memory",
          id: "prefers-bun",
          value: { title: "Prefers Bun", content: "Run repository commands with bun." },
        },
      ],
    })
    if (Result.isFailure(result)) return yield* Console.log(`rejected: ${result.failure.reason}`)
    yield* store.save(result.success.state)
    yield* Console.log(HarnessOverview.formatOverview(result.success.state, { maxEntriesPerKind: 4 }))
  }),
)

const runtime = ManagedRuntime.make(HarnessStore.layerMemory)
await runtime.runPromise(program)
```

Run `bun examples/package-composition-guides/src/harness.ts`.

## Errors, requirements, and resources

`Refinement.applyProposal` is pure and returns `Result<RefinementResult, RefinementRejected>`; it never partially applies a proposal. `HarnessStore` operations fail with schema-backed `HarnessStoreError`. `HarnessSnapshot.decode` fails with `SnapshotInvalid` or `SnapshotMismatch`. The in-memory store owns no external resource.

## Engine contract

- Every entry carries `id`, `kind`, `scope`, `title`, `content`, optional `path`/`reference`/`arguments`/`metadata`/`source`, `createdAt`, `updatedAt`, and a monotonic `version`.
- `applyProposal` rejects create-existing, update-missing, delete-missing, duplicate targets, stale `baseVersion`, a drifted `baseSnapshot`, per-kind capacity overflow, and a pinned `revision`.
- Every applied edit records exact `before`/`after` entries, so `rollbackProposal` produces the inverse proposal that restores the earlier snapshot byte for byte.
- `HarnessMerge.mergeStates(outer, inner)` overlays scopes; an inner entry wins over an outer entry of the same kind and id, and each surviving entry keeps its authoring scope.
- `HarnessOverview.formatOverview` output size depends only on the supplied bounds, never on state size, and its ordering is deterministic.
- `HarnessSnapshot` pins one exact state as `harness-snapshot:v1:sha256:<digest>` plus the closed-JSON payload a durable host records in an executable registration under codec `@batonfx/harness/snapshot`, version `1`. Refinement history is audit data and is deliberately outside the pinned identity.

## More

### Trusted and untrusted authorship

An edit's `revision` pins an entry's exact `createdAt`, `updatedAt`, and `version`. Rollback needs it; untrusted authors must never have it.

```ts
const proposal = yield * Authorship.authorProposal(modelSuppliedJson)
```

`authorProposal` decodes against `AuthoredProposal`, whose create and update edits have no `revision` field, and refuses input carrying one with `AuthorshipRejected { reason: "pinned-revision" }` rather than silently stripping it. The brand it mints is a compile-time discriminator that a cast can erase, so `Refinement.applyProposal` additionally rejects a revision-pinning proposal at runtime with `RefinementRejected { reason: "pinned-revision" }` — that check, not the brand, is the authorization boundary. `Refinement.rollbackProposal` is the trusted path that does set `revision`, applied through `applyTrustedProposal`. `Refinement.isAuthored` reports the distinction for host-side assertions.

### Durable store

`FileSystemHarnessStore.layer({ path })` writes a uniquely named temporary file (mode `0o600`) into the destination directory (created at mode `0o700`), then renames it over the target. A reader never observes a partial state, a failed write leaves the previous state intact, concurrent saves of one scope are serialized, and a corrupt file fails with `reason: "corrupt"` instead of resetting the scope.

- Store locations, scope policy, and refine flows are host-owned; this package owns only the engine.
