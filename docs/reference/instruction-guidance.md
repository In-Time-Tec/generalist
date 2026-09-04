---
title: "generalist/instructions"
description: "The instruction guidance engine: versioned entries, audited refinements, rollback, scope merge, bounded overview, and content-addressed snapshots."
---

generalist/instructions is the generic engine for versioned instructions an agent may refine and a host may pin into a later Execution. It owns entry identity, versions, atomic proposals, rollback, scope overlay, bounded prompt overviews, and snapshot identity. Store locations, scope policy, and refine flows stay host-owned.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

`generalist/instructions` is an import subpath, not a package.

## Entry kinds

One guidance state holds four kinds of entry, each keyed by `id` within its kind. An id may repeat across kinds.

| Kind       | Meaning                                                               |
| ---------- | --------------------------------------------------------------------- |
| `prompt`   | A durable prompt note appended to the agent's standing guidance       |
| `memory`   | A durable fact or preference the agent should retain                  |
| `skill`    | A reusable procedure, usually with a callable reference and arguments |
| `subagent` | A delegation spec describing a reusable child role                    |

Every entry carries `id`, `kind`, `scope`, `title`, `content`, optional `path`, `reference`, `arguments`, `metadata`, `source`, plus `createdAt`, `updatedAt`, and a monotonic `version` that starts at 1.

## Authored and trusted proposals

An edit's `revision` pins an entry's exact `createdAt`, `updatedAt`, and `version`. Rollback needs it; an untrusted author must never have it. The engine makes that a contract rather than host advice.

| Path                      | Contract                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Authorship.author`       | The only entry point for model-originated input. It decodes against `AuthoredProposal`, whose create and update edits have no `revision` field at all |
| `Refinement.apply`        | Accepts only the opaque `AuthoredRefinementProposal` that authorship mints, so an untrusted proposal shape cannot reach the apply seam by accident    |
| `Refinement.applyTrusted` | The separately named route for a proposal that may pin a `revision`, which is how rollback and restore work                                           |
| `Refinement.makeRollback` | The trusted path, which does set `revision` so a rollback restores the exact earlier entry                                                            |
| `Authorship.isAuthored`   | Reports whether a proposal leaves every revision to the engine, for host-side assertions                                                              |

A pinned revision is refused with `AuthorshipRejected { reason: "pinned-revision" }` rather than silently stripped, so a caller learns its proposal was rejected instead of quietly getting different semantics. Malformed input, unknown edit tags, empty edit lists, and excess properties fail `reason: "malformed"`. An accepted authored create always lands at version 1, and an accepted authored update always bumps to `version + 1` while preserving the original `createdAt`.

## Apply and rollback

`Refinement.apply(state, proposal, options?)` takes the authored proposal and `Refinement.applyTrusted(state, proposal, options?)` takes one that may pin a revision. Both are pure and atomic: they return `Result<RefinementResult, RefinementRejected>`, apply every edit or none, and never mutate their input. Each applied edit records the exact `before` and `after` entry, which is what makes rollback exact.

| Rejection             | Cause                                                              |
| --------------------- | ------------------------------------------------------------------ |
| `baseline-drift`      | The proposal pinned a `baseSnapshot` that is not the current state |
| `create-existing`     | A create targeted an id that already exists in that kind           |
| `update-missing`      | An update targeted an entry that does not exist                    |
| `delete-missing`      | A delete targeted an entry that does not exist                     |
| `duplicate-target`    | One proposal edited the same kind and id twice                     |
| `version-drift`       | An edit pinned a `baseVersion` that is not the entry's version     |
| `kind-capacity`       | The result exceeded `maxEntriesPerKind`                            |
| `rollback-not-newest` | A rollback targeted anything other than the newest refinement      |

`Refinement.makeRollback(result, options)` builds the inverse proposal: edits reversed, each guarded by the version it undoes, and `baseSnapshot` derived from the supplied current state. It marks the refinement being reversed, so applying anything other than the newest fails `rollback-not-newest` before an inverse edit can report a misleading entry conflict. Applying the newest inverse restores the earlier snapshot exactly.

## Scope merge

`State.merge(outer, inner)` overlays one scope on another. An inner entry wins over an outer entry of the same kind and id, an override applies only within a kind, every surviving entry keeps the scope that authored it, and the merged state takes the inner scope. Refinement history merges by instant, then scope, then proposal id, so the result is deterministic.

## Bounded prompt overview

`Overview.format(state, options?)` renders the compact overview a system prompt carries. Its size depends only on `maxEntriesPerKind`, `maxContentLength`, `maxTitleLength`, and `maxRefinements` — never on how many entries or refinements the state holds — so growing guidance cannot grow the prompt. Selection is id-sorted and kinds render in canonical order, so the same state always renders the same text. Full entries are read on demand from the state itself.

## Snapshot identity

`Snapshot.make(state)` pins one exact state as `guidance-snapshot:v1:sha256:<digest>` over the schema version, scope, and encoded entries. Refinement history is audit data and stays outside the identity, so recording an event does not change what a snapshot means. `Snapshot.encode` produces the closed-JSON payload a durable host records in an executable registration under codec `generalist/instructions/snapshot`, version `1`, and `Snapshot.decode(id, payload)` reconstructs the exact state or fails `SnapshotMismatch` or `SnapshotInvalid`.

## Store port and layers

`Store` is the load and save seam, keyed by scope. Loading an unknown scope yields an empty state; every other failure is a typed `StoreError` carrying `reason: "corrupt" | "encode" | "unreadable" | "unwritable"`.

| Layer                             | Use                                                          |
| --------------------------------- | ------------------------------------------------------------ |
| `Store.layerMemory`               | In-process state for tests and hosts without durable storage |
| `Store.layerTest`                 | A supplied implementation for exercising host behavior       |
| `FileSystemStore.layer({ path })` | Durable state over `FileSystem` and `Path`                   |

The durable store keeps the location decision with the host through `path(scope)` and owns only encoding and atomicity. A save writes a uniquely named temporary file at mode `0600` inside the destination directory, creating it at mode `0700` when missing, then renames it over the target. A reader never observes a partial state, a failed write leaves the previous state intact and removes its temporary, saves of one scope are serialized, and a corrupt file fails typed and stays on disk instead of resetting the scope. See [generalist context](/reference/core-context) for the instruction and skill seams a host composes it with.
