# Instruction guidance

Instruction guidance turns scoped prompt notes, memories, skills, and subagent specifications into atomic, versioned state. A host can overlay scopes, bound model-facing overviews, and pin an exact state into later Executions.

## Usage

```ts
import { Effect, Result } from "effect"
import { Authorship, Overview, Refinement, Registration, State } from "generalist/instructions"

const program = Effect.gen(function* () {
  const initial = State.empty("agent:reviewer")
  const proposal = yield* Authorship.author({
    id: "model-1",
    at: "2026-08-31T12:00:00.000Z",
    edits: [
      {
        _tag: "Create",
        kind: "memory",
        id: "typescript",
        value: { title: "TypeScript", content: "Prefer exact types." },
      },
    ],
  })
  const changed = Result.getOrThrow(Refinement.apply(initial, proposal))
  const overview = Overview.format(changed.state)
  const pinned = Registration.make(changed.state, "guidance")
  return { changed, overview, pinned }
})
```

## What runs

```text
program
├── Authorship.author(unknown)
│   ├── reject any revision key
│   └── decode + brand AuthoredRefinementProposal
├── Refinement.apply(state, proposal)
│   └── validate; create memory/typescript v1; record before/after
├── Overview.format(changed.state)
└── Registration.make(changed.state, "guidance")
    └── encode payload + create content-addressed capability
```

## Data flow

```text
Authored edit { kind: "memory", id: "typescript", revision: absent }
        │ Refinement.apply() at 2026-08-31T12:00:00.000Z
        ▼
{ kind: "memory", id: "typescript", scope: "agent:reviewer",
  version: 1, createdAt: "2026-08-31T12:00:00.000Z",
  updatedAt: "2026-08-31T12:00:00.000Z" }
```

## Rollback and scope overlay

```text
RefinementResult for "model-1"
└── Refinement.makeRollback(result, { id: "rollback-1", at: ... })
    └── Refinement.applyTrusted(current, inverse with prior revisions)
        ├── newest event is "model-1" → restore
        └── newer event exists → rollback-not-newest

outer memory/typescript { scope: "team", version: 3 }
inner memory/typescript { scope: "agent:reviewer", version: 1 }
  └── State.merge → inner memory/typescript, scope "agent:reviewer"
```

## Invariants

- Entry identity is `(kind, id)` within a state; kinds are `prompt`, `memory`, `skill`, and `subagent`.
- Entries carry `scope`, title, content, timestamps, and a monotonic version; optional fields are `path`, `reference`, `arguments`, `metadata`, and `source`.
- Entries remain in canonical kind then id order.
- `State.merge` lets the inner scope win only for equal `(kind, id)` and preserves every surviving entry's authoring scope.
- `Overview.format` is deterministic; output size depends only on supplied bounds, never total entries or refinement history.
- Ordinary untrusted input passes through `Authorship.author`, then `Refinement.apply`.
- `Authorship.author` rejects, rather than strips, any `revision` key with `AuthorshipRejected { reason: "pinned-revision" }`.
- Its opaque brand is compile-time only; `Refinement.apply` also rejects pinned revisions at runtime, even after a cast.
- `Authorship.isAuthored` and `Refinement.isAuthored` report whether every revision is engine-owned.
- Authored creates start at version 1; updates increment it, preserve `createdAt`, and set `updatedAt` to the proposal instant.
- Every applied edit records its exact `before` and `after` entry.
- A proposal is atomic: existing creates, missing updates/deletes, duplicate targets, stale `baseVersion`, drifted `baseSnapshot`, per-kind overflow, or pinned revisions reject without changing input state.
- `Refinement.makeRollback` reverses edits in reverse order, identifies the refinement, and derives its baseline from current state.
- Only the newest refinement may be rolled back; exact revision restoration uses the separately named trusted route, `Refinement.applyTrusted`.
- Snapshot ids include schema version, scope, and encoded entries, but exclude refinement history.
- Registrations carry closed, secret-free JSON under codec `generalist/instructions/snapshot`, version `1`; payload drift fails decoding.
- `Store` loads and saves by scope; `Store.layerMemory` is process-local.
- `StoreError.reason` is `corrupt`, `encode`, `unreadable`, or `unwritable`.
- `FileSystemStore.layer({ path })` leaves locations to the host and uses Effect `FileSystem` and `Path`.
- Filesystem saves create directories with mode `0o700`, write unique same-directory temporary files with mode `0o600`, then rename atomically.
- Saves to one target file are semaphore-serialized; failed writes preserve the previous state and clean up their temporary file.
- Missing files load empty; corrupt or out-of-contract files remain on disk and fail as `corrupt` instead of resetting state.

## Related

- Source: `packages/generalist/src/instructions/`
- Site: `/docs/guides/instruction-guidance`, `/docs/reference/instruction-guidance`, `/docs/reference/versioning`
