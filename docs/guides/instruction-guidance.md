---
title: "Let an agent refine its own guidance"
description: "Accept a model-authored refinement, apply it atomically, roll it back exactly, persist it durably, and pin one exact state into a durable Execution."
---

`generalist/instructions` is the engine for versioned instructions an agent may refine and a host may pin: prompt notes, memories, skills, and subagent specs, each versioned and audited. Store locations, scope policy, and the refine flow itself stay host-owned.

## 1. Accept a refinement from the model

Model-originated input goes through `Authorship.author` and nowhere else. It decodes against `AuthoredProposal`, whose create and update edits have no `revision` field, and refuses input carrying one rather than silently stripping it — so a caller learns its proposal was rejected instead of quietly getting different semantics.

**refine-and-roll-back.ts**

```typescript
import { Console, Effect, ManagedRuntime, Result } from "effect"
import { Authorship, Overview, State, Store, Refinement } from "generalist/instructions"

const scope = "thread:demo"

/** Exactly the shape a model proposes: no revision field exists on an authored edit. */
const modelProposal = {
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
}

const forged = {
  ...modelProposal,
  id: "proposal-2",
  edits: [
    {
      ...modelProposal.edits[0],
      revision: { createdAt: "1999-01-01T00:00:00.000Z", updatedAt: "1999-01-01T00:00:00.000Z", version: 4242 },
    },
  ],
}

const program = Store.Store.use((store) =>
  Effect.gen(function* () {
    const state = yield* store.load(scope)

    const proposal = yield* Authorship.author(modelProposal)
    const applied = Refinement.apply(state, proposal)
    if (Result.isFailure(applied)) return yield* Console.log(`rejected: ${applied.failure.reason}`)
    yield* store.save(applied.success.state)

    const created = State.findEntry(applied.success.state, "memory", "prefers-bun")
    yield* Console.log(`created version: ${created?.version}, createdAt: ${created?.createdAt}`)

    const refused = yield* Effect.flip(Authorship.author(forged))
    yield* Console.log(`authorship refused: ${refused.reason}`)

    const inverse = Refinement.makeRollback(applied.success, {
      id: "rollback-1",
      at: "2024-01-02T00:00:00.000Z",
    })
    const restored = Refinement.applyTrusted(applied.success.state, inverse)
    if (Result.isFailure(restored)) return yield* Console.log(`rollback rejected: ${restored.failure.reason}`)
    yield* store.save(restored.success.state)
    yield* Console.log(
      `after rollback: ${State.findEntry(restored.success.state, "memory", "prefers-bun") === undefined ? "absent" : "present"}`,
    )
    yield* Console.log(Overview.format(restored.success.state, { maxEntriesPerKind: 2 }))
  }),
)

const runtime = ManagedRuntime.make(Store.layerMemory)
await runtime.runPromise(program)
```

**Output**

```text
created version: 1, createdAt: 2024-01-01T00:00:00.000Z
authorship refused: pinned-revision
after rollback: absent
guidance guidance-snapshot:v1:sha256:3be72a563c867c9963edaebabf55b807d460093fb58a5304bcff91904967ad1c (scope thread:demo)

prompt: 0

memory: 0

skill: 0

subagent: 0

recent refinements: 2
- 2024-01-01T00:00:00.000Z proposal-1: Create:memory/prefers-bun
- 2024-01-02T00:00:00.000Z rollback-1: Delete:memory/prefers-bun
```

`Refinement.apply` is pure and atomic: it returns `Result<RefinementResult, RefinementRejected>`, applies every edit or none, and never mutates its input. Revision stays the engine's — an accepted create lands at version 1 with the proposal instant, and an accepted update bumps to `version + 1` while preserving the original `createdAt`.

<Note title="The brand is not the boundary">
`apply` accepts only the opaque `AuthoredRefinementProposal` that authorship mints, which is a compile-time discriminator a cast can erase. The runtime authorization boundary is the check inside `apply` itself: a proposal whose edits pin a revision is rejected with `RefinementRejected { reason: "pinned-revision" }` even when a cast erased the brand. A host mounting this behind an unknown boundary gets that check without re-deriving it.
</Note>

## 2. Roll one back exactly

Every applied edit records the exact `before` and `after` entry, which is what makes rollback exact rather than approximate. `Refinement.makeRollback` builds the inverse proposal: edits reversed, each guarded by the version it undoes, and `baseSnapshot` derived from the supplied current state. Applying any target other than the newest fails `rollback-not-newest` before inverse edits are evaluated.

Rollback is the trusted path and does set `revision`, which is how it restores the exact earlier entry instead of a bumped one. It is applied with the separately named `Refinement.applyTrusted`, so the two authority levels never share one call site.

## 3. Persist it durably

`Store.layerMemory` is the in-process store. `FileSystemStore.layer({ path })` is the durable one: the host owns every location decision through `path(scope)` and the package owns encoding and atomicity.

**A durable store on the Bun filesystem**

```typescript
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { Layer } from "effect"
import { FileSystemStore } from "generalist/instructions"

const storeLayer = FileSystemStore.layer({
  path: (scope) => `${process.env.HOME}/.generalist/instructions/${encodeURIComponent(scope)}.json`,
}).pipe(Layer.provide(bunServices))
```

| Guarantee                                       | How                                                                                                                                                                     |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A reader never observes a partial state         | A save writes a uniquely named temporary file at mode `0600` inside the destination directory, creating it at mode `0700` when missing, then renames it over the target |
| A failed write leaves the previous state intact | The temporary is removed on failure and the target is never touched                                                                                                     |
| Concurrent saves of one scope do not interleave | A per-file semaphore serializes them                                                                                                                                    |
| A corrupt file is never silently reset          | `reason: "corrupt"` is returned and the file stays on disk                                                                                                              |
| An unknown scope is not an error                | Loading one yields an empty state                                                                                                                                       |

## 4. Pin one exact state into a durable Execution

A durable host must reconstruct the same guidance a Run started with, not whatever the store holds now. `Registration.make(state, name)` produces the named capability and the exact secret-free payload for it.

**pin-a-snapshot.ts**

```typescript
import { Console, Effect } from "effect"
import { Entry, Registration, Snapshot, State } from "generalist/instructions"

const scope = "thread:demo"
const at = "2024-01-01T00:00:00.000Z"

const entry = (id: string, kind: Entry.GuidanceKind): Entry.GuidanceEntry => ({
  id,
  kind,
  scope,
  title: `title ${id}`,
  content: `content ${id}`,
  createdAt: at,
  updatedAt: at,
  version: 1,
})

const state = State.make({ scope, entries: [entry("prefers-bun", "memory"), entry("review", "skill")] })

const program = Effect.gen(function* () {
  const pinned = Registration.make(state, "guidance")
  yield* Console.log(`snapshot: ${pinned.id}`)
  yield* Console.log(`capability: ${pinned.capability.name}`)
  yield* Console.log(`codec: ${pinned.capability.content?.codec} version: ${pinned.capability.content?.version}`)

  // The durable host records { pin, codec, version, payload } and Generalist reconstructs the exact state.
  const restored = yield* Snapshot.decode(pinned.id, pinned.payload)
  yield* Console.log(
    `restored entries: ${State.allEntries(restored)
      .map((item) => item.id)
      .join(", ")}`,
  )

  const drifted = Snapshot.encode(State.make({ scope, entries: [entry("prefers-bun", "memory")] }))
  const mismatch = yield* Effect.flip(Snapshot.decode(pinned.id, drifted))
  yield* Console.log(`drifted payload: ${mismatch._tag}`)
})

await Effect.runPromise(program)
```

**Output**

```text
snapshot: guidance-snapshot:v1:sha256:a2ea3f9a8a67667791480dbfb770dbeb3840d9718d0c2910ffe465126d7e18bb
capability: guidance
codec: generalist/instructions/snapshot version: 1
restored entries: prefers-bun, review
drifted payload: generalist/instructions/SnapshotMismatch
```

The capability carries pinned content, so the executable digest changes when the state changes and Runtime's registration validation requires the supplied payload to match the declared codec, version, and digest. Refinement history is audit data and stays outside the pinned identity, so recording an event does not change what a snapshot means. See [the generalist/instructions reference](/reference/instruction-guidance) for the full rejection taxonomy, scope merge, and bounded overview contracts.
