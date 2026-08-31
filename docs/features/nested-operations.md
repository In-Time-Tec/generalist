# Nested durable operations

A nested operation is one durable operation that runs inside another. A composite tool call — a cell, an agent program step — crosses many authoritative boundaries, and each crossing is journaled under the outer operation's identity before the handler runs. `generalist` owns the contract and the process-local implementation; `generalist/runtime` owns the durable one.

- `NestedOperation.run(request, effect)` executes one crossing. A `Request` carries `kind`, `payload`, a `replayPolicy`, an optional `approval`, and an optional `render`.
- Identity is derived, never supplied. The ambient `ToolContext` names the outer operation through `operationKey`, and the host assigns the ordinal, so tool or cell code cannot forge, reorder, or collide with another call's journal. The persisted key is `<operationKey>#<ordinal>`.
- The operation is recorded as `running` before the handler crosses its boundary, so a crash mid-boundary still leaves a record that the side effect was attempted.
- A duplicate identity returns the recorded outcome instead of repeating the effect. A reused identity carrying different content fails `NestedOperation.Divergence` with both the recorded and requested kind and digest. A crossing whose outcome was never observed under `replayPolicy: "never"` settles `unknown` and fails `NestedOperation.Unknown` for explicit resolution rather than silently repeating.
- `approval` routes the crossing through the ambient `Approvals` service before it runs. `Denied` fails `NestedOperation.Denied` and records a failed operation; `Pending` fails `NestedOperation.Suspended`, which `NestedOperation.catchSuspension` translates into the tool executor's `Suspend` outcome. A durable host opens the matching wait through `waitFor`. Without an `Approvals` service the crossing auto-approves.
- `NestedOperation.layerDirect` is the process-local implementation for hosts with no durable storage: identity, duplicate return, and divergence hold for the life of the run, and approvals auto-approve because a process-local host owns no resolution seam.

## Render

`Render` is a host-side projection of one nested operation's own outcome, for a host that draws more than a status line. It is the closed union of `Artifact` (path, mime type, byte size, optional width and height) and `Diff` (path, patch).

The value is produced by the handler's `render` function from the operation's **real result**, never read from the request payload. A cell that plants a `render` field — or a whole `nestedOperation` object — in its input does not dictate what the host displays.

One `ToolContext.Progress` record is emitted per status transition under the `nestedOperation` data key, carrying `kind`, `ordinal`, `status`, and the projection. `running` never carries a projection because there is no outcome yet, and a failed operation carries none either. A projection larger than `NestedOperation.maxRenderBytes` (64 KiB) is withheld whole and reported as `renderWithheldBytes` while the operation still succeeds: a partial diff or a truncated artifact descriptor would render as a smaller correct change rather than as a missing one.
