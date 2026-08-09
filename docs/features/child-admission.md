# Non-blocking child admission

`ChildAdmission` is the direct-child route that returns at admission rather than at completion. `ChildRuns` keeps the blocking `run_child` path and the child-group operations unchanged; this is an additional route.

- `admit` returns `AdmitReceipt { childRunId, key, duplicate }` once the durable child Run exists. `key` is host-supplied admission identity: two admissions under one key name one child, and the second reports `duplicate: true`.
- `listDirect`, `inspect`, `join`, and `cancel` operate on direct children only. `join` reads the child's current state; it does **not** block until the child is terminal, so a caller that must wait polls it or follows Run events.
- Parentage is read from the durable child record. Knowing a child Run id grants nothing to a Run that did not admit it: a mismatched parent fails `ChildParentageInvalid`.
- `ChildAdmission.makeAgentChildren(store)` provides the in-execution surface behind the `AgentChildren` service. Every operation derives `parentRunId`, `toolCallId`, and `operationKey` from the ambient `ToolContext`, so a caller names only the work. `ToolContext` stays in the signature deliberately: binding one Run into the service at Layer creation would let a caller admit and cancel children under another Run.

## Child origin

`ChildOrigin { operationKey, ordinal }` names the operation that ran the code and the host-assigned ordinal within it, so a presentation layer can group children under their originating cell in source order.

Origin travels inside the invocation id — `child-admit:<toolCallId>:<operationKey>#<ordinal>:<key>`, with each segment percent-encoded — because `invocationId` is the one admission field Baton already carries into `ChildLinked` and every canonical child-tree event. Correlation therefore survives replay, restart, and reload with no event-schema change. `ChildAdmission.invocationIdFor` builds it, `admissionOf` reads the whole admission identity back, and `originOf` reads just the origin; an invocation id that carries no origin, or one Baton did not mint, reads back as `undefined`.

The ordinal is derived from the parent's own durable children:

- Ordinals within one operation are dense and follow admission order, and each operation key starts its own sequence.
- The counter is scoped per parent Run, so one cell key cannot leak ordinals across Runs.
- A re-admitted key keeps its original ordinal instead of advancing the counter, which is what makes replay and host restart return the same children rather than duplicating them.
- An ordinal already taken under the operation is never reused, even when the taken set is sparse.
- An admission that never reaches the store does not spend an ordinal.
- Origin and ordinal supplied in the caller's payload are ignored; they are derived from the ambient context and the store.

An execution that carries no `operationKey` admits without an origin.
