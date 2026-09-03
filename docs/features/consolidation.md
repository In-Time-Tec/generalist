# Sleep-time memory consolidation (unstable)

`generalist/unstable/learning` can register a background Agent that periodically reads recent successful Runs from the durable journal and proposes semantic-memory or instruction rewrites. Consolidation is a fresh Runtime Run, not an in-process timer callback, so its model work has its own journal, session, and budget.

```ts
import { Effect } from "effect"
import { Memory } from "generalist"
import * as Learning from "generalist/unstable/learning"

const learning = Learning.layer({
  propose: Learning.consolidate({
    schedule: "FREQ=DAILY;BYHOUR=3",
    window: "24 hours",
    model: "cheap-model",
    maxProposals: 20,
    budget: { tokens: 20_000, duration: "10 minutes" },
  }),
  apply: {
    Remember: ({ memory, evidence }) => Memory.Memory.use((service) => service.remember({ ...memory, evidence })),
    Forget: ({ memory }) => Memory.Memory.use((service) => service.forget(memory)),
    RefineInstruction: ({ target, diff }) => Effect.logInfo("Apply reviewed instruction diff", { target, diff }),
  },
})
```

The layer requires a hosted `Runtime`, version-capable semantic `Memory`, `ModelRegistry`, and `Approvals`. Provide `SemanticRecall.layer` over `VectorStore.layerMemory` or `layerPgVector` directly rather than the convenience working-plus-semantic memory composition. A model string selects the one registered model whose model name or `provider/model` name matches; use an exact `{ provider, model, registrationKey? }` selection when that name is ambiguous.

## Runtime flow

At layer construction, Generalist registers the internal `generalist-learning-consolidation` Agent and its stable schedule. Re-registering the same schedule definition is idempotent across Runtime restarts. A changed definition under that stable identity fails instead of silently running two consolidation schedules.

Each occurrence:

1. starts a fresh Run in session `learning` with the configured budget;
2. selects the newest successful non-consolidation Runs, up to 10,000, whose terminal journal timestamp is within `window`;
3. projects those journals to `Trajectory` values and recalls current semantic memory at `{ agent: "learning", subject: "learning" }`;
4. asks the selected model for at most `maxProposals` `Remember`, `Forget`, or `RefineInstruction` proposals;
5. records the proposal list and sends every proposal through the existing Learning nested-operation approval path.

The proposal Schema rejects skills, exports, and over-limit output. `budget` uses the ordinary `RunBudget` dimensions. Exhaustion suspends that occurrence as `BudgetExhausted`; it does not borrow from foreground Runs or stop the next scheduled occurrence.

## Contradictions and evidence

A correction is never an overwrite. The model must return a `Forget` and a `Remember` for the same `entryId`; the `Remember` identifies the active numeric version with `supersedes`. Generalist rejects an unpaired or nonexistent supersession before approval. For a valid pair, both proposals receive the union of:

- the superseded version's evidence;
- the `Forget` proposal's evidence; and
- the `Remember` proposal's evidence.

Every evidence item is an exact `{ runId, turn }` journal reference. The approved `Remember` appends the next version while old text remains in `Memory.history(entryId)`. `Memory.revert(entryId, { to })` changes active recall back to a retained version without deleting newer history.

## Approval

Consolidation uses the existing capability `learning` at level `ask`. It adds no approval type or level. To auto-approve lower permission levels while still delegating learning asks, use `Approvals.layerTiered({ askAbove: "ask", ask })`. A denied proposal is journaled and its handler does not run; pending and crash recovery follow the same rules as every other Learning proposal.

## Limits

- Consolidation reads durable Runtime journals, so process-local `Agent.run` calls are not episodes.
- Only successful Runs are candidates. The current scan is bounded to the newest 10,000 successful Runs before applying `window`.
- Versioning must be backed by a semantic adapter that implements `history` and `revert`. WorkingMemory and Supermemory do not.
- The recurrence subset and `BYHOUR` behavior are UTC-only; see [triggers](./triggers.md).

## Related

- [Learning](./learning.md)
- [Memory](./memory.md)
- [Approvals](./approvals.md)
- [Triggers](./triggers.md)
- [Trajectories](./evals.md)
