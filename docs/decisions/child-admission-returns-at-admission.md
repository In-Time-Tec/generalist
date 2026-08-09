# Spawning a child returns at admission, not at completion

`ChildAdmission.admit` returns `AdmitReceipt { childRunId, key, duplicate }` as soon as the durable child Run exists. It never carries an outcome. A caller that wants the answer joins explicitly through `join`, `inspect`, or Run events.

Admission answers "which durable child owns this work", not "what did it produce". A handle that waited for completion would make a crash between spawn and answer indistinguishable from a spawn that never happened; a handle minted at admission means the child is already durable and recoverable when the caller receives it. The blocking `run_child` path and the child-group operations keep their existing semantics — this is an additional route, not a replacement.

`ChildOrigin` travels with the admission. A cell admits many children in one tool call, so the tool call alone does not say which cell statement produced which child, nor in what order. Origin names the operation that ran the code plus a host-assigned ordinal within it.

The ordinal is derived from the parent's own durable children rather than from an in-process counter, and `child-origin.test.ts` proves why both properties matter:

- **Unforgeable.** Origin and ordinal supplied in the caller's payload are ignored; a later admission cannot push itself to ordinal 0. Parentage comes from the ambient `ToolContext`, so model code cannot admit, list, inspect, join, or cancel a child under another Run.
- **Stable across restart.** The ordinal is encoded into the invocation id, which derives the idempotency key. A counter that restarted at zero would mint a second invocation id for the same logical spawn and silently duplicate a child Run. A key already admitted under this operation keeps its original ordinal; only a genuinely new key extends the sequence, and an ordinal already taken — even a sparse one — is never reused.

The cost is one direct-child read per admission. That cost is deliberate: caching the sequence in process reintroduces the duplicate-child failure, so restart safety is chosen over speed here.
