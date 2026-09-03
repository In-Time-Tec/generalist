# Approval-gated learning proposals

`generalist/unstable/learning` is a post-run proposal seam. After a hosted Runtime Agent reaches `Hooks.onRunEnd`, a proposer receives that run's `Trajectory` and may return instruction, skill, memory, or trajectory-export proposals. Generalist records the proposal list and each individual proposal in the existing nested-operation journal before asking for approval.

This is **not** model training. It does not fine-tune a model, update model weights, silently rewrite prompts, or decide that a proposal is safe. Nothing is applied until the configured `Approvals` service returns `Approved`.

## Proposal contract

```ts
import * as Learning from "generalist/unstable/learning"

const proposal: Learning.Proposal = {
  _tag: "RefineInstruction",
  target: "release-guidance",
  diff: "Require a clean package smoke test before publishing.",
  evidence: [{ runId: "run:release-review", turn: 2 }],
}
```

`TrajectoryRef` names one recorded `runId` and zero-based turn. A `Remember` proposal carries the same key, turn, transcript, terminal, optional `entryId`, and optional `supersedes` fields accepted by the core Memory service; its `evidence` is passed separately to the handler. `Forget` removes one identified memory from active recall and also carries evidence. The learning seam dispatches only on `_tag`; except for consolidation's contradiction validation, it does not interpret instruction diffs, skill content, memories, or exports. Applications own those effects.

## Layer

```ts
import { Effect, Layer } from "effect"
import { Memory } from "generalist"
import { Runtime } from "generalist/runtime"
import * as Learning from "generalist/unstable/learning"

declare const model: Parameters<typeof Learning.proposeWithModel>[0]["model"]

const learning = Learning.layer({
  propose: Learning.proposeWithModel({ model, maxProposals: 3 }),
  apply: {
    RefineInstruction: ({ target, diff }) => Effect.logInfo("Apply instruction diff", { target, diff }),
    AuthorSkill: ({ name, content }) => Effect.logInfo("Write skill", { name, content }),
    Remember: ({ memory, evidence }) => Memory.Memory.use((service) => service.remember({ ...memory, evidence })),
    Forget: ({ memory }) => Memory.Memory.use((service) => service.forget(memory)),
    ExportTrajectory: ({ runId, format }) => Effect.logInfo("Export trajectory", { runId, format }),
  },
})

const forRuntime = (runtime: Runtime.Service) => learning.pipe(Layer.provide(Layer.succeed(Runtime.Runtime, runtime)))
```

The logging handlers above are deliberately placeholders: Instructions and SkillCatalog do not expose a matching public mutation API, and trajectory export still needs an application-owned destination. Replace each placeholder with the product's real Effect. `Remember` is the one direct adapter because the core Memory service already owns a matching operation.

`layer` provides a `Hooks` service holding only the learning declaration and requires `Runtime` plus `Approvals`. When the environment already declares other hooks, build the declaration with `Learning.declaration(options)` and pass it to `Hooks.layer([...])` or a Host plugin's `hooks` instead, because one environment has one `Hooks` service. Either way it needs a hosted Runtime because process-local runs have no durable operation journal or restartable approval wait.

## Approval and recovery

Every individual proposal opens an approval request with:

- capability `"learning"`, represented by the existing `Pending.call.name` field;
- `level: "ask"`, the existing tiered `Permissions.Level` representing work that must be reviewed;
- the complete proposal as the approval input.

There is no separate `"learning"` approval level or approval type. `Approvals.layerTiered({ askAbove: "ask", ... })` therefore delegates learning proposals through the same policy seam as other asks.

A denial records `NestedOperationDenied`, including the operator reason, as that proposal operation's failed journal outcome. Its handler does not run, and later proposals may still be reviewed. An approval starts the mapped handler. A recorded success is replayed without invoking the handler again.

If `Approvals` returns `Pending`, Runtime persists the nested-operation suspension and exposes its token through `runtime.operator.explain` and `scanObligations`. Resolve that exact token with `runtime.operator.resolveApproval(token, decision, operator)`. Restart then replays the recorded proposal list, consumes the decision, and applies the handler once. A crash after a non-idempotent handler crossed its boundary but before its outcome was recorded becomes an ordinary `Unknown` recovery obligation; Generalist does not guess or repeat the side effect.

## Model proposer

`proposeWithModel` uses Effect AI structured output with the exported `Proposal` Schema. `maxProposals` defaults to `3`; the output Schema rejects a larger list. Custom proposers receive the same completed `Trajectory` and return a plain Effect, so products may replace the model with deterministic rules or another reviewer without changing approval or recovery behavior.

## Scheduled consolidation

`consolidate({ schedule, window, model, maxProposals, budget? })` is a proposer that `Learning.layer` recognizes as a scheduled background Agent. It runs in the `learning` session with its own Run budget, projects recent successful journal episodes, recalls the `learning` semantic-memory key, and returns only `Remember`, `Forget`, or `RefineInstruction` proposals. Model names resolve against one registered model; an exact `ModelSelection` removes ambiguity.

Contradictory memory changes must be `Forget` + superseding `Remember` pairs. Consolidation merges both proposal evidence sets with the old version's evidence before the ordinary `learning` / `ask` approval operations are journaled. See [consolidation](./consolidation.md) for setup, validation, scheduling, and adapter requirements.

## Related

- Lifecycle trigger: [`hooks.md`](./hooks.md)
- Approval adapters: [`approvals.md`](./approvals.md)
- Durable operation behavior: [`nested-operations.md`](./nested-operations.md)
- Operator recovery: [`recovery.md`](./recovery.md)
- Trajectories: [`evals.md`](./evals.md)
- Sleep-time consolidation: [`consolidation.md`](./consolidation.md)
