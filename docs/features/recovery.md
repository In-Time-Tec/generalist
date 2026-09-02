# Typed recovery and operator actions

Runtime derives recovery from each Run's authoritative journal. It does not persist a second recovery-state record. `runtime.operator.explain(runId)` projects the Run status, primary decision, last durable sequence, and all outstanding obligations without changing the Run. `verify(runId)` performs the same projection and reports contradictions between materialized Run state and journal facts in `drift`.

## Decisions and legal actions

| Decision                                  | Meaning                                                                               | Legal operator action                                                                                                                                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Resume`                                  | The journal has no unresolved recovery obligation.                                    | `wake(runId, operator)` only when the Run is durably suspended in `waiting` and every open wait is an external wait. Otherwise execution continues through the ordinary Runtime worker path.                                 |
| `RetryOperation { operationId, attempt }` | The named running operation has a replay-safe policy.                                 | `retry(runId, operator)` resets exactly that operation for replay and releases its prior execution ownership.                                                                                                                |
| `AwaitApproval { token }`                 | The exact durable approval token is still open.                                       | `resolveApproval(token, Approved(...) \| Denied(...), operator)` resolves that token through `Approvals.resolve`.                                                                                                            |
| `AwaitBudget { budget }`                  | The Run is suspended because the named budget dimension is exhausted.                 | `extendBudget(runId, delta, operator)` validates the delta, journals `BudgetExtended` through the Runtime primitive, records the operator identity, and resumes the Run when that delta replenishes the exhausted dimension. |
| `Unknown { operationId, reason }`         | A dispatched side effect has no authoritative outcome. Blind redispatch is forbidden. | `resolveUnknown(runId, operationId, { outcome: "succeeded", result } \| { outcome: "failed", error }, operator)` records the human-supplied outcome.                                                                         |
| `Failed { error }`                        | The terminal failure has no supported recovery transition.                            | None. Inspect `error`, repair the caller or Agent boundary, and start distinct work if appropriate.                                                                                                                          |

Any action outside these conditions fails with `IllegalOperatorAction { runId, decision, action }`; it is never treated as a no-op. `resolveUnknown` may target any matching `Unknown` obligation even when another obligation is the primary decision. `resolveApproval` follows the same rule for its exact token.

## Operator API

Every mutation requires an operator identity string from the caller:

```ts
const operator = runtime.operator

yield * operator.explain(runId)
yield * operator.verify(runId)
yield * operator.retry(runId, "user:alice")
yield * operator.wake(runId, "user:alice")
yield * operator.resolveUnknown(runId, operationId, resolution, "user:alice")
yield * operator.resolveApproval(token, Approvals.Approved(), "user:alice")
yield * operator.extendBudget(runId, delta, "user:alice")

const obligations = operator.scanObligations()
```

Successful mutations append a terminal `operator` operation to the same Run journal. Its input records the identity and exact action. Recovery projection excludes these audit operations from executable obligations. Budget extension uses the same journaled primitive as `runtime.extendBudget`; the operator API adds legality checking and identity instead of introducing another budget authority.

`scanObligations()` streams `{ runId, decision }` for every stored Run whose primary decision is not `Resume`. Consumers should call `explain` again immediately before acting because another worker or operator can change the journal after a scan.

## Recovery ordering

When several obligations coexist, the primary decision is deterministic: unknown outcomes first, then replay-safe retries, approvals, and budget exhaustion. `obligations` preserves every projected item, so resolving one unknown does not make a Run claimable while another unknown remains.
