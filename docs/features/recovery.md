---
title: "Typed recovery and operator actions"
description: "Inspect authoritative obligations and resolve uncertain work with stable command identities."
---

Runtime derives recovery from each Run's authoritative journal. It does not persist a second recovery-state record. `runtime.operator.explain(runId)` projects the Run status, primary decision, last durable sequence, and all outstanding obligations without changing the Run. `verify(runId)` performs the same projection and reports contradictions between materialized Run state and journal facts in `drift`.

## Decisions and legal actions

| Decision                                  | Meaning                                                                               | Legal operator action                                                                                                                                                                                                                   |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Resume`                                  | The journal has no unresolved recovery obligation.                                    | `wake(runId, operator, commandId)` only when the Run is durably suspended in `waiting` and every open wait is an external wait. Otherwise execution continues through the ordinary Runtime worker path.                                 |
| `RetryOperation { operationId, attempt }` | The named running operation has a replay-safe policy.                                 | `retry(runId, operator, commandId)` resets exactly that operation for replay and releases its prior execution ownership.                                                                                                                |
| `AwaitApproval { token }`                 | The exact durable approval token is still open.                                       | `resolveApproval(token, Approved(...) \| Denied(...), operator, commandId)` resolves that token through `Approvals.resolve`.                                                                                                            |
| `AwaitBudget { budget }`                  | The Run is suspended because the named budget dimension is exhausted.                 | `extendBudget(runId, delta, operator, commandId)` validates the delta, journals `BudgetExtended` through the Runtime primitive, records the operator identity, and resumes the Run when that delta replenishes the exhausted dimension. |
| `Unknown { operationId, reason }`         | A dispatched side effect has no authoritative outcome. Blind redispatch is forbidden. | `resolveUnknown(runId, operationId, { outcome: "succeeded", result } \| { outcome: "failed", error }, operator, commandId)` records the human-supplied outcome.                                                                         |
| `Failed { error }`                        | The terminal failure has no supported recovery transition.                            | None. Inspect `error`, repair the caller or Agent boundary, and start distinct work if appropriate.                                                                                                                                     |

Any action outside these conditions fails with `IllegalOperatorAction { runId, decision, action }`; it is never treated as a no-op. `resolveUnknown` may target any matching `Unknown` obligation even when another obligation is the primary decision. `resolveApproval` follows the same rule for its exact token.

## Operator API

Mutations require an authenticated operator identity. Retry, wake, unknown resolution, and budget extension also require a stable caller command ID. This is an Effect generator fragment:

```ts
const operator = runtime.operator

yield * operator.explain(runId)
yield * operator.verify(runId)
yield * operator.retry(runId, "user:alice", "retry:1")
yield * operator.wake(runId, "user:alice", "wake:1")
yield * operator.resolveUnknown(runId, operationId, resolution, "user:alice", "resolve:1")
yield * operator.resolveApproval(token, Approvals.Approved(), "user:alice", "approval:alice:1")
yield * operator.extendBudget(runId, delta, "user:alice", "budget:1")

const obligations = operator.scanObligations()
```

Successful mutations append a terminal `operator` operation to the same Run journal. Its input records the identity and exact action. Recovery projection excludes these audit operations from executable obligations. Budget extension uses the same journaled primitive as `runtime.extendBudget`; the operator API adds legality checking and identity instead of introducing another budget authority.

`scanObligations()` streams `{ runId, decision }` for every stored Run whose primary decision is not `Resume`. Consumers should call `explain` again immediately before acting because another worker or operator can change the journal after a scan.

## Recovery ordering

When several obligations coexist, the primary decision is deterministic: unknown outcomes first, then replay-safe retries, approvals, and budget exhaustion. `obligations` preserves every projected item, so resolving one unknown does not make a Run claimable while another unknown remains.

## Recovery lifetime and beta upgrades

Recovery is a same-version contract: keep the exact executable registrations, application code, Generalist version, and Effect version that authored unfinished work. A checkpoint is not portable application code. Replacing a registration with a different implementation under the same identity is not an upgrade strategy. Missing or incompatible executable identities must fail closed, not route to the newest agent.

The clean v1 object format has no legacy reader, compatibility alias, or automatic migration path. Use a fresh namespace for the cutover and preserve the old deployment and executable bundle read-only if its history must be retained. Unsupported or corrupt data fails closed; never alter stored identities, checksums, or receipts to bypass validation.

Back up the complete quiesced object namespace, including canonical commits, snapshots, receipts, and referenced blobs. A copied event stream or latest snapshot alone is not a restorable Runtime. Follow the [object backup procedure](./durable-stores.md#backup-and-restore) and test fresh-Layer recovery before relying on it.

Retained append-only history, command receipts, external outcomes, and incurred costs survive rewind. Exact command retries return the original immutable receipt; `duplicate: false` can remain false on a retry. Rewinding changes the current branch, not the evidence that work was accepted or charged. Referenced blobs and sandbox snapshots must remain retrievable. Automatic live-history reclamation is not provided; never delete production objects to repair recovery or recover capacity.

Forking is not rollback of external side effects. Supported retained tool/model continuations replay committed outcomes; unknown `never` operations still require explicit resolution. Do not promise arbitrary source-code/time travel across changed programs or every possible pending compound-operation frontier. See [fork boundaries](./fork.md) and [storage limits](./durable-stores.md#scoping-and-limits).
