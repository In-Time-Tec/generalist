# Continual harness

The continual harness is the versioned agent-guidance store: prompt notes, memories, skills, and subagent specs that a running agent may refine and a host may pin into a later Execution. `@batonfx/harness` owns the generic engine; every store location, scope policy, and refine flow stays host-owned.

- An entry carries `id`, `kind`, `scope`, `title`, `content`, optional `path`, `reference`, `arguments`, `metadata`, `source`, plus `createdAt`, `updatedAt`, and a monotonic `version`.
- `Refinement.applyProposal` is pure and atomic: it applies every edit or none, and rejects create-existing, update-missing, delete-missing, duplicate targets, a stale `baseVersion`, a drifted `baseSnapshot`, per-kind capacity overflow, and a pinned `revision`. It accepts only the authored proposal `Authorship.authorProposal` mints; `Refinement.applyTrustedProposal` is the separately named route for a proposal that may pin a revision.
- Each applied edit records exact before and after entries, so `Refinement.rollbackProposal` produces the inverse proposal that restores the earlier snapshot exactly. It derives its baseline from the supplied current state and marks the refinement it reverses; applying it rejects any target other than the newest refinement with `rollback-not-newest` before evaluating inverse edits.
- `HarnessMerge.mergeStates(outer, inner)` overlays scopes: an inner entry wins over an outer entry of the same kind and id, and every surviving entry keeps its authoring scope.
- `HarnessOverview.formatOverview` renders a bounded prompt overview whose size depends only on the supplied bounds, never on how many entries or refinements the state holds, and whose ordering is deterministic.
- `HarnessSnapshot` pins one exact state as `harness-snapshot:v1:sha256:<digest>` with the closed-JSON payload a durable host records in an executable registration under codec `@batonfx/harness/snapshot`, version `1`. Refinement history is audit data and stays outside the pinned identity.

## Trusted and untrusted authorship

An edit's `revision` pins an entry's exact `createdAt`, `updatedAt`, and `version`. Rollback needs it; untrusted authors must never have it. The engine makes that a contract rather than host advice.

- `Authorship.authorProposal(input)` is the only entry point for model-originated or otherwise untrusted proposals. It decodes against `AuthoredProposal`, whose `AuthoredCreateEdit` and `AuthoredUpdateEdit` have no `revision` field, and refuses input carrying one with `AuthorshipRejected { reason: "pinned-revision" }`. It refuses rather than silently stripping, so a caller learns its proposal was rejected instead of quietly getting different semantics.
- An accepted authored proposal always leaves revision to the engine: a create lands at version 1 with the proposal instant, and an update bumps to `version + 1` while preserving the original `createdAt`.
- `Refinement.rollbackProposal` is the trusted path and does set `revision`, which is how a rollback restores the exact earlier entry instead of a bumped one. Its result is applied with `Refinement.applyTrustedProposal`.
- The brand is a compile-time discriminator, not a runtime one. `Authorship.authorProposal` returns an opaque `AuthoredRefinementProposal` that nothing else mints, and `Refinement.applyProposal` accepts only that type, so decoding untrusted input as a `RefinementProposal` and applying it no longer type-checks. `Brand.nominal` erases at compile time, so a cast defeats the type alone.
- The runtime authorization boundary is the check inside `Refinement.applyProposal`: a proposal whose edits pin a `revision` is rejected with `RefinementRejected { reason: "pinned-revision" }` even when a cast erased the brand. A host mounting this behind an `unknown` boundary gets that check without re-deriving it.
- `Refinement.isAuthored(proposal)` reports whether a proposal leaves every revision to the engine, so a host can assert the distinction at its own boundary. `Authorship.isAuthored` re-exports it.

## Stores

- `HarnessStore` is the load/save-by-scope seam. `HarnessStoreError` carries a typed `reason`: `corrupt`, `encode`, `unreadable`, or `unwritable`.
- `HarnessStore.layerMemory` is the in-process implementation.
- `FileSystemHarnessStore.layer({ path })` is the durable implementation over Effect's `FileSystem` and `Path`. The host owns every location decision through `path(scope)`; the package owns encoding and atomicity. A save writes a uniquely named temporary file in the destination directory with mode `0o600`, creating the directory with mode `0o700` when missing, then renames it over the target, so a reader never observes a partial state and a failed write leaves the previous state intact. Saves of one scope are serialized by a per-file semaphore. A corrupt or out-of-contract file fails with `reason: "corrupt"` and is left on disk rather than silently reset.
