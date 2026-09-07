# Run forking and rewind

Runtime can continue from an earlier durable checkpoint without redispatching the operations in the retained journal prefix.

```ts
const branch =
  yield *
  runtime.fork(runId, {
    commandId: "fork:counterfactual:1",
    atSequence: 12,
    substitute: { operationId: "tool:lookup:1", result: { value: "counterfactual" } },
  })

yield * runtime.rewind(runId, { commandId: "rewind:1", toSequence: 12 })
```

`fork` creates and activates a new Run. `rewind` replaces the named Run's future in place and activates it again. Both select the checkpoint committed at the requested event sequence, retain the journal and completed-operation prefix through that point, and resume strict replay from the authoritative operation cursor. Inspection exposes direct descendants as `branches: [{ runId, forkedAt }]`.

Preserve `commandId` across an exact retry. A bounded source requires a fresh `budget` allocation for its fork, and Program branches use separately reserved `programBudget` resources. Rewinding a settled child can require a new ancestor grant; neither operation copies an old allowance or refunds incurred spend.

## Counterfactual substitution

The optional substitution names one completed tool operation in the retained prefix. Runtime replaces that operation's stored result before execution continues and appends `Substituted { operationId }` to the branch journal. The operation key and digest do not change, so replay consumes the substituted result instead of invoking the tool again. Model, incomplete, missing, and post-boundary operations fail with `SubstitutionInvalid`.

## Boundaries

- The requested sequence must exist and carry a committed checkpoint. Otherwise the transition fails with `ForkSequenceInvalid`.
- A Run with no sandbox progress in the selected prefix can fork normally. If its latest `SandboxSnapshot` progress marker is `SandboxSnapshotUnavailable`, the transition fails with `NoSnapshot`; a later available snapshot makes later prefixes forkable again.
- Fork and rewind are atomic store transitions. A reopened object-backed Runtime sees either the old state or the complete branch state, never a partially copied prefix.
- Each branch owns its selected prefix. Retained append-only history, receipts, external outcomes, and incurred costs remain authoritative across branch changes.
- Rewind retains the abandoned Run and Session future as a branch and changes the active projection to the selected checkpoint. It does not delete canonical objects or refund incurred costs. New branch-local operations use their own identities, while retries of accepted commands keep their original receipts.
- Runtime journal, operation, Session, and child state remain authoritative. At execution bootstrap, the durable host derives the newest valid `SandboxSnapshot` from the retained journal. The first sandbox-using tool restores that snapshot under the branch Session key; after successful restoration, later cells acquire the keyed branch Sandbox instead of applying the inherited snapshot again. Rewind follows the same path using its selected journal prefix.
- Snapshot recovery reads the authoritative store, not process memory. Closing and reopening an object-backed Runtime between the source Run and its fork does not lose the inherited Sandbox state.

## Host join point

`host.sessions.fork(runId, options)` returns the branch handle and `host.runs.rewind(runId, options)` rewinds a Run. Server transports should call these methods; routes and wire schemas are outside this feature.

## Related

- Runtime: [`runtime.md`](./runtime.md)
- Sandbox snapshots: [`sandbox.md`](./sandbox.md)
- Host: [`host.md`](./host.md)
