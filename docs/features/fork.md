# Run forking and rewind

Runtime can continue from an earlier durable checkpoint without redispatching the operations in the retained journal prefix.

```ts
const branch =
  yield *
  runtime.fork(runId, {
    atSequence: 12,
    substitute: { operationId: "tool:lookup:1", result: { value: "counterfactual" } },
  })

yield * runtime.rewind(runId, { toSequence: 12 })
```

`fork` creates and activates a new Run. `rewind` replaces the named Run's future in place and activates it again. Both select the checkpoint committed at the requested event sequence, retain the journal and completed-operation prefix through that point, and resume strict replay from the authoritative operation cursor. Inspection exposes direct descendants as `branches: [{ runId, forkedAt }]`.

## Counterfactual substitution

The optional substitution names one completed tool operation in the retained prefix. Runtime replaces that operation's stored result before execution continues and appends `Substituted { operationId }` to the branch journal. The operation key and digest do not change, so replay consumes the substituted result instead of invoking the tool again. Model, incomplete, missing, and post-boundary operations fail with `SubstitutionInvalid`.

## Boundaries

- The requested sequence must exist and carry a committed checkpoint. Otherwise the transition fails with `ForkSequenceInvalid`.
- A Run with no sandbox progress in the selected prefix can fork normally. If its latest `SandboxSnapshot` progress marker is `SandboxSnapshotUnavailable`, the transition fails with `NoSnapshot`; a later available snapshot makes later prefixes forkable again.
- Fork and rewind are atomic store transitions. A reopened SQL Runtime sees either the old state or the complete branch state, never a partially copied prefix.
- Each branch owns a copied prefix. Memory, SQLite, PostgreSQL, and MySQL use the same behavior without reference-aware event reads.
- Rewind retains the discarded future as a branch before replacing the source Run.
- Runtime journal, operation, Session, and child state remain authoritative. The copied branch journal carries the latest Sandbox snapshot ID, but restoring a branch Sandbox from that ID is not wired yet. `Sandbox.layerWorktree` is the process-host leaf intended to serve that later restoration path.

## Host join point

`host.sessions.fork(runId, options)` returns the branch handle and `host.runs.rewind(runId, options)` rewinds a Run. Server transports should call these methods; routes and wire schemas are outside this feature.

## Related

- Runtime: [`runtime.md`](./runtime.md)
- Sandbox snapshots: [`sandbox.md`](./sandbox.md)
- Host: [`host.md`](./host.md)
