# Baton Durable Session Plan

## Purpose

This file is the sole implementation and acceptance plan for making durable `Session` the authority for model-facing conversation history in Baton, and for making Rika thread continuation work through it.

It supersedes nothing in `PLAN.md`; that file owns the completed native-execution migration. This file owns one new capability and the deletions it forces.

This is a clean-break greenfield change. Do not preserve the legacy compaction pointer, the run-scoped chat seeding path, or any shim that lets a Run start with empty history. Delete every replaced path when its replacement lands.

`CONTEXT.md` owns implemented vocabulary and boundaries. Feature docs and executable interfaces own implemented behavior. This file owns target interfaces, unfinished work, dependency order, deletion scope, and release acceptance.

## The Defect

`Runtime.start` accepts `sessionId` but no conversation history. `sessionId` selects a lane and an idempotency scope only; it is never a continuity key.

`packages/runtime/src/sql/store-admit.ts` admits a Run with `transcript_json` unset. `packages/runtime/src/execution-host.ts` then calls:

```ts
runAgent(
  continuation?.prompt ?? claimed.message.prompt,
  continuation?.history ?? claimed.transcript, // both undefined on a fresh turn
  checkpoint,
  continuation,
)
```

`RunOptions.history` is therefore omitted and `packages/core/src/agent/setup.ts` seeds `Chat.fromPrompt([system])`.

Every turn of a multi-turn conversation runs with an empty model context. Verified in a real Rika thread: three sequential turns in session `b39c96d4-5e3e-42ff-b397-b24573173208` produced three independent transcripts, and the third turn's assistant output opens with "No prior context in this session".

`transcript_json` is written only by `saveCompletionContinuation` for in-run steering. It is never carried across Runs.

## Why Session, Not A History Parameter

Adding `StartInput.history` would work and is smaller. It is rejected because it makes every host reassemble and resend the whole conversation on every turn, puts the authoritative conversation outside the runtime that owns durability, and gives branching, forking, and restart-safe compaction no home.

`packages/core/src/context/session.ts` already defines the correct interface: an append-only `Entry` log with `parentId`, a mutable leaf, `reserveEntryId`, `path(leaf)`, `appendCheckpoint`, and `SessionConflict` with `stale-leaf` and `fenced`. It has `layerMemory` and `layerTest` and no durable implementation, and nothing in `packages/runtime` provides it. The abstraction is right and unfinished.

## Convergent Evidence

Two independent coding agents solved this the same way. Their agreements are treated as design constraints, not preferences.

Pi (`pi.dev`, Earendil Inc., MIT) ships a JSONL entry tree and its in-progress durable rewrite publishes this SQLite schema in `@earendil-works/pi-session-backend-sqlite-node`:

```sql
entries        (session_id, seq, id, parent_id, type, timestamp, payload)
records        (session_id, seq, id, lane, run_id, type, op_kind, timestamp, payload)
lanes          (session_id, lane, leaf_id, open_operation_id)
writer_leases  (session_id, owner_id, fence, expires_at_ms)
```

OpenCode projects a durable event log into a `session_message` table and assembles each request with `SessionHistory.entriesForRunner(db, sessionID, baselineSeq)`.

Constraints taken from them:

- The system prompt is derived per request from live inputs and is never persisted in conversation history. Pi's option type is `systemPrompt?: string | (() => string | Promise<string>)`, evaluated per request; it is persisted only as a per-run override inside the execution record. OpenCode re-reconciles a Context Epoch at each safe boundary.
- A compaction checkpoint materializes the retained history. Pi shipped a `firstKeptEntryId` pointer, then replaced it: "V4 never exposes or persists `firstKeptEntryId`" and "the compaction entry is a self-contained checkpoint: context builds never read past it".
- Conversation and execution are two logs. Pi: "records are not tree entries because they describe execution, not conversation: they must never enter model context, transcripts, branch queries, or forks", and "deleting every operation log leaves a complete, valid conversation".
- History is a tree from the start. Pi shipped linear at v1 and paid a v1-to-v2 migration to add `parentId`.
- Mutable metadata does not live in the conversation log. Pi moved session name and labels out of the tree into last-write-wins facts in its rewrite.
- A child agent derives its session identity deterministically from its invocation so a replayed spawn reattaches instead of creating a twin.
- A re-derived system prompt must be cache-stable. Pi removed the current date from its default prompt twice for provider prompt-cache invalidation.

## Non-Negotiable Decisions

- `Session` is the authority for model-facing history. A Run never carries a conversation across turns.
- `Chat` is seeded from the Session path. It is never seeded from an empty prompt when a Session path exists.
- The system prompt is re-derived every turn from live `Instructions` sources. It is persisted only as a per-run override for resume determinism.
- Every compaction checkpoint materializes its projected history. Pointer-based compaction is deleted.
- The checkpoint carries no version field. Versioning arrives with a second shape and a real migration, not before.
- Conversation entries and run records stay separate. Dropping every run record must leave a valid conversation.
- Root Runs and child Runs never share a Session identity.
- SQLite `Session` is single-writer and fenced, consistent with the existing SQLite `RunStore`.
- Do not add a durability mode to individual appends.

## Ownership

Baton owns Session storage, path projection, leaf movement, fencing, compaction checkpoints, and system-prompt derivation.

Rika owns thread identity, turn admission, the display transcript, and the decision to continue a thread.

Rika never assembles model history. Rika never reads `baton_sessions` or any Baton table.

## Canonical Interfaces

### Session durable layer

New `packages/runtime/src/sql/session-store.ts` mirroring `makeSqliteRunStore` in `packages/runtime/src/sql/store.ts`:

```ts
export const makeSqliteSessionStore: (
  options: SqliteSessionStoreOptions,
) => Effect.Effect<SessionStore.Interface, SqliteStoreError, SqlClient.SqlClient | Scope.Scope>
```

Wired in `packages/runtime/src/sql/runtime-layer.ts` beside `RunStore`, sharing the existing client layer and the `SCHEMA_STATEMENTS` / `SCHEMA_VERSION` / `schemaChecksum` migration path in `packages/runtime/src/sql/schema.ts` and `migrate.ts`. Bump `SCHEMA_VERSION`.

Schema:

```sql
CREATE TABLE baton_session_entries (
  session_id TEXT NOT NULL,
  entry_id   TEXT NOT NULL,
  parent_id  TEXT,
  seq        INTEGER NOT NULL,
  tag        TEXT NOT NULL,
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, entry_id)
);
CREATE UNIQUE INDEX baton_session_entries_seq_idx ON baton_session_entries(session_id, seq);
CREATE INDEX baton_session_entries_parent_idx ON baton_session_entries(session_id, parent_id);

CREATE TABLE baton_sessions (
  session_id TEXT PRIMARY KEY,
  leaf_id    TEXT,
  next_seq   INTEGER NOT NULL,
  owner_token TEXT,
  updated_at TEXT NOT NULL
);
```

`owner_token` enforces the existing `SessionConflict` reason `fenced`. A write whose `ownerToken` does not match a non-null stored token fails typed. `appendCheckpoint` writes projection, telemetry, and commit in one transaction, matching the atomicity `docs/features/session-and-compaction.md` already claims.

### Chat seeding

`packages/core/src/agent/setup.ts:425` currently reads:

```ts
const freshChat =
  options.history !== undefined
    ? Chat.fromPrompt(options.history)
    : system !== undefined
      ? Chat.fromPrompt([Prompt.makeMessage("system", { content: system })])
      : Chat.empty
```

This is the defect site. When a `SessionStore` is present, seed from `buildContext(path)` with the freshly derived system message prepended. The prefix invariant that `syncSessionBody` in `packages/core/src/agent/compaction-runtime.ts:28` checks then holds by construction, so a resumed session cannot fail with "Session projection is not a prefix of authoritative Chat history".

`RunOptions.history` remains for direct process-bound `Agent.stream` callers with no Session. It is not the durable path.

### System prompt derivation

`setup.ts:273` and `:285` guard instructions-epoch derivation and skill-listing injection on `options.history === undefined`. Under Session these guards freeze a resumed thread on the system prompt captured at turn one.

Derive per turn. A Session-backed run always opens a fresh instructions epoch and always injects current skill listings, regardless of `options.history`. The system message is never a Session `Entry`.

Persist the derived prompt only when a run is resumed mid-flight, as a per-run override alongside the existing suspension state, so recovery replays the exact prompt the run was admitted with.

`Instructions` sources must be cache-stable. Add an acceptance test that renders an epoch twice across a simulated date change and asserts an identical string.

### Child session identity

`Runtime.spawn` must not inherit the parent's Session. Derive:

```ts
sessionId = childSessionId(parentSessionId, invocationId)
```

Deterministic, so a replayed spawn reattaches to the same child Session instead of creating a twin. Record `parentSessionId` on the child Session row for traversal and export.

### Compaction checkpoint

`packages/core/src/context/session.ts:388` already projects the exact checkpoint as self-contained:

```ts
const messages = compaction?.version === 2 ? [...compaction.projectedHistory.content] : []
```

Keep this behavior and delete the legacy branch. Then delete `version` itself.

`version` exists only to discriminate `LegacyCompactionEntry` from `CheckpointEntry` inside the `CompactionEntry` union. Once the legacy entry is gone the union collapses to one member, `_tag: "Compaction"` is the whole discriminator, and `version: 2` is a literal that no code can branch on. Baton has never shipped a durable Session, so there is no persisted entry carrying it and nothing to migrate.

Target:

```ts
/** @experimental An exact point-in-time compaction projection. */
export interface CompactionEntry extends BaseEntry {
  readonly _tag: "Compaction"
  readonly projectedHistory: Prompt.Prompt
  readonly telemetry: ReadonlyArray<ModelTelemetryEvent>
  readonly compactionCommit?: CompactionCommit
  readonly summary?: string
}
```

Do not introduce a schema version, a `version: 1`, or a reserved field for a future one. Add versioning when a second shape exists and the migration is real.

## Deletion Inventory

Delete, do not deprecate.

Legacy compaction pointer:

- `LegacyCompactionEntry` (`packages/core/src/context/session.ts:54`), its `version?: 1` at `:56`, and its `firstKeptEntryId` at `:58`.
- The `CompactionEntry` union at `:70`. Rename `CheckpointEntry` to `CompactionEntry`; there is only one shape.
- The `firstKeptEntryId` lookup and slice branches in `projectedMessages` (`session.ts:389-400`), including `checkpointMessage`.
- Legacy compaction append validation (`session.ts:199`, `:223`, `:226-227`).
- `firstKeptEntryId` on the compaction plan and result (`packages/core/src/turn/compaction.ts:54`, `:90`, `:283`, `:458`).
- The `LegacyCompactionEntry` re-export in `packages/core/src/context/facade-session.ts:41`.

Checkpoint `version`, every site:

- the field declaration (`session.ts:63`)
- `version: 2` construction (`session.ts:338`)
- the `entry.version !== 2` guard in `appendCheckpoint` idempotency (`session.ts:300`); `_tag` plus `checkpointMatches` already decide reuse
- the four projection branches (`session.ts:388`, `:390`, `:396`, `:400`), which collapse into one self-contained projection
- `checkpoint.version === 2` in `packages/core/src/agent/compaction-runtime.ts:107`
- `checkpoint.version !== 2` and the two `version === 2` reads in `packages/core/src/agent/setup.ts:122`, `:306`, `:307`
- `Extract<Session.AppendInput, { readonly version: 2 }>` in `packages/core/test/session.test.ts:21`. The `AppendEntryInput` conditional at `session.ts:87` already excludes checkpoints structurally, so retarget this assertion at the renamed `CompactionEntry`.
- `packages/core/test/persistence.test.ts:909`, `:917`, `:988` and `packages/core/test/agent.test.ts:3705`, `:3747`, `:3907`
- the `version: 2` row in `apps/docs/src/pages/reference/core-context.ts:138`, including its "legacy summary and `firstKeptEntryId` entries remain readable" note

Leave every unrelated `version` alone. `Pins.makeCapability({ version })`, `DriverCheckpoint.driverVersion`, the Program checkpoint `version: "1"`, `tree-cursor.ts`, MCP OAuth, and the skills catalog are separate identifiers and are not in scope.

System prompt:

- The `options.history === undefined` guards on instructions and skills in `setup.ts:273` and `:285`.

Tests:

- Any test asserting pointer-based compaction projection. Replace with checkpoint projection tests.

Keep `Session.layerMemory` and `layerTest`; they are the test and process-bound paths.

## Rika Scope

`packages/product/src/execution/contract/execution-gateway-request.ts` `StartTurn` is unchanged. It carries one prompt. That is correct and stays correct.

`packages/baton-execution/src/baton-execution.ts` `startTurn` is unchanged except that `sessionId: input.threadId` now means what it appears to mean.

The title spawn at `baton-execution.ts:205` and the review fan-out members at `:183` currently pass `sessionId: input.threadId`. Under Session that would feed the entire thread to the Title agent. It moves to the derived child identity.

`packages/product/src/operation/dispatch/product-operation-execution-context.ts:16` `markdownExport` joins `turn.prompt` only, dropping all assistant output. It is used for `@thread` mention expansion, not continuity, and stays as is. Do not grow it into a history mechanism.

Rika deletes nothing structural. This is deliberate: the missing capability is Baton's.

## Implemented boundary

Core now treats every provided `SessionStore` as conversation authority, without requiring Compaction. It durably synchronizes each non-system model-input prefix before provider contact. Runtime memory and SQLite atomically commit the normalized completed assistant Session entry with the canonical operation outcome and one semantic response event; exact retries deduplicate and divergent identity, parent, or payload retries roll back. Same-run handoff completion likewise atomically imports its deterministic conversation-only Handoff projection with the succeeded operation, checkpoint advance, and executable switch; recovery starts from the latest Compaction or Handoff boundary. SQLite schema version 5 removes the Run transcript column, and memory/SQLite continuation and suspension recovery rebuild from Session.

PostgreSQL and MySQL now have dialect-native Session storage and atomic completed, interrupted, and handoff conversation commits. PostgreSQL schema version 4 and MySQL schema version 4 remove `transcript_json`; every shipped Runtime dialect now uses Session as conversation authority.

## Acceptance

Baton:

- a second `Runtime.start` on one `sessionId` runs with the first turn's messages in model context
- a third turn contains turns one and two
- process restart between turns preserves history
- a resumed thread renders the current system prompt, not the one captured at turn one
- editing an `Instructions` source between turns changes the next turn's system message
- rendering an instructions epoch twice across a date change produces an identical string
- a spawned child Run does not receive parent thread history
- a replayed spawn reattaches to the same child Session
- a compaction checkpoint projects without reading entries before it
- no Session entry type carries a version field
- deleting every row from `baton_runs`, `baton_run_events`, and `baton_run_operations` leaves a projectable conversation
- a second writer with a stale `ownerToken` fails with `SessionConflict` reason `fenced`
- `Session` behavior is identical across `layerMemory` and the SQLite layer

Rika:

- `rika threads continue <id>` followed by a prompt referencing earlier turns is answered from history
- the Title agent receives only its own prompt
- a subagent does not receive parent thread history
- the display transcript is unchanged

## Implementation Order

Strict. Each step lands green before the next begins.

1. Delete the legacy compaction surface and the checkpoint `version` field in the deletion inventory. Rename `CheckpointEntry` to `CompactionEntry`. Prove `Session.layerMemory` and compaction tests still pass. This is pure subtraction and isolates the deletion from the feature.
2. Seed `Chat` from the Session path in `setup.ts`. Prove with `layerMemory` that two sequential `Agent.stream` runs sharing one `SessionStore` accumulate context. No SQL yet. This closes the defect at its root.
3. Derive the system prompt per turn. Remove the two `options.history` guards. Prove freshness, resume determinism, and cache stability.
4. Implement `makeSqliteSessionStore` and wire it into `runtime-layer.ts`. Bump `SCHEMA_VERSION`. Prove the memory and SQLite layers are behaviorally identical, and prove fencing.
5. Derive child Session identity in `Runtime.spawn`. Prove isolation and replay reattachment.
6. Prove restart, compaction-checkpoint projection, and the record-independence invariant on SQLite.
7. Run Baton local release gates. Release with explicit authorization.
8. Pin Rika. Move the Rika title spawn to the derived child identity. Prove the Rika acceptance list.

Steps 1 through 3 are the whole behavioral fix and are provable with the in-memory layer. Steps 4 through 6 make it durable. Do not reorder: implementing SQLite before step 2 produces a Session that immediately fails the prefix check.

## Documentation

- `docs/features/session-and-compaction.md` gains the durable SQLite layer, per-turn system-prompt derivation, and the conversation-versus-record invariant. Remove pointer-based compaction language and every reference to a versioned checkpoint.
- `CONTEXT.md` states that Session, not Run, owns model-facing history.
- `docs/decisions/durable-session-history.md` records why Session was chosen over a start-input history parameter, citing the convergent evidence.

## Stop Conditions

Do not ship a path that lets a Run start with empty history when a Session path exists.

Do not persist a system prompt as a conversation entry.

Do not reintroduce a compaction pointer.

Do not add a version field, a schema-version column, or a reserved future-shape field to any Session entry before a second shape actually exists.

Do not let a child Run inherit its parent's Session identity.

Do not solve a blocker with compatibility code. Correct the owning interface, migrate every caller, and delete the replaced path.
