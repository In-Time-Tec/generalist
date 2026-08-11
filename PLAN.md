# Baton And Rika Semantic Model Output Plan

## Purpose

This is the sole unfinished implementation and acceptance plan for removing model-fragment amplification from Baton and Rika. It supersedes the completed native-execution migration plan.

The target is a clean break. Do not preserve durable `ModelPart` history, transcript-bearing lifecycle events, fragment projectors, compatibility schemas, or old projection behavior. Baton releases first; Rika then consumes the released semantic-output contract.

Do not disturb a live profile while measuring or implementing this work. The current production sample is evidence, not a database to mutate.

## Why The Current Design Is Wrong

The system confuses three different things:

- provider transport fragments, which are arbitrary bytes chosen by an SDK or network boundary;
- live preview, which is disposable presentation state;
- completed model output, which is an execution fact.

It then forces all three through one durable event pipeline:

```text
provider part
  -> Core ModelPart
  -> Runtime RunEvent
  -> SQL event row and tree-index row
  -> Rika Run-tree projection
  -> Rika transcript transaction and projector checkpoint
  -> Server feed frame
  -> terminal presentation
```

Verified ownership failures:

- `packages/core/src/agent/model-turn.ts` turns every accepted provider part into `ModelPart` and retains every transformed part until the attempt ends.
- `packages/runtime/src/execution-host.ts` forwards Core events to Runtime persistence without classifying transport, preview, and execution facts.
- `packages/runtime/src/sql/store-helpers.ts` performs an event insert, tree-root update, tree-root read, tree-index insert, Run update, and live publication for one appended event; every emitted event owns a transaction.
- `packages/core/src/agent/agent-event.ts` puts a full growing transcript in `TurnCompleted`; Runtime persists that event and also replaces `baton_runs.transcript_json`.
- `packages/runtime/src/sql/store-helpers.ts` publishes before the enclosing SQLite transaction is known to have committed on the `emitAgentEvent` path.
- `packages/baton-execution/src/baton-projection-batching.ts` batches only after Baton has already paid the durable cost.
- `packages/baton-execution/src/baton-tree-projector.ts` reconstructs product text and tool parameters from raw `ModelPart` fragments, advances one revision per raw event, and serializes another projector checkpoint.
- `packages/baton-execution/src/baton-streamed-text-projection.ts` repeatedly searches existing chunks and rebuilds immutable strings while applying fragments.
- `packages/product/src/thread/queue/root-turn-owner.ts` retains every projection change in an array only to recover the last checkpoint, retaining cumulative streamed snapshots unnecessarily.
- `root-turn-watcher` deduplicates callback delivery and then republishes the returned accumulated changes; three overflow/resync layers and a TUI FIFO then compensate for this multiplied stream.
- `terminal-interactive-feed` rebuilds the full terminal model from the current snapshot for every applied live patch, so provider chunking reaches physical presentation work.

The live profile made the cost visible:

- about 160,000 Baton event rows and 264 MB of encoded event JSON;
- a 599 MB Baton SQLite database;
- about 18,500 `ModelPart` rows in the active Run at inspection time;
- 8,855 of those parts, about 48 percent, carried empty deltas;
- one Server JavaScript thread occupied approximately one full core while the kernel was idle;
- a Server physical footprint near 1.05 GB, of which about 900 MB was reclaimable JavaScriptCore allocator memory.

Rika's downstream batching reduced feed amplification but left the authority error intact. Increasing that window, adding another cache, forcing garbage collection, restarting periodically, or buying a larger runner would add compensation around the wrong representation.

## The Simple Model

A model call has one durable outcome.

```text
                         best-effort bounded observer
provider stream -> normalized response builder ----------------> live preview
                         |
                         +-- one atomic completed operation ----> durable Run fact
```

Streaming is presentation. The completed normalized response is execution truth.

There is no preview database, preview journal, preview cursor, preview checkpoint, second replay protocol, or mergeable preview history. A preview may disappear on process loss. A committed response may not.

## Non-Negotiable Invariants

### One semantic outcome

One logical model operation produces at most one committed normalized response. The operation key and execution fence reject a stale worker and make an identical repeated completion idempotent.

### Durable prefix

Every Runtime cursor denotes a committed database prefix. A subscriber never observes an event that later rolls back. Notifications are published only after commit.

### Scheduled input precedes the provider

Before contacting the provider, Runtime atomically records the immutable model-operation input, prompt identity, operation key, pending driver checkpoint, attempt fence, and exact steering batch consumed into that input. Recovery never reconstructs a different request from later steering or configuration.

### Atomic model completion

Completion atomically compares the scheduled operation and fence, records the normalized response outcome, applies the post-operation driver checkpoint, and appends the semantic Run event/outbox. It does not consume steering. These completion records either commit together or do not commit.

### Preview has no authority

Dropping every preview must leave Run status, operation state, driver checkpoint, Session, durable transcript, usage, tool admission, projection revision, and terminal result unchanged. Preview delivery is bounded, conflated, droppable, and scoped to the live execution attempt.

### Final output replaces preview

A preview is keyed by Run, attempt fence, model call, and model attempt. A committed response replaces the overlay; it is never concatenated with it. Retry, cancellation, handoff, and completion reject stale preview frames.

### Session remains conversation authority

The Baton Session is the complete model-facing conversation. Run history records execution facts. Dropping execution history must still leave a complete conversation, as required by `docs/features/session-and-compaction.md`.

The committed model-operation outcome is the canonical completed response. `ModelResponseCommitted` is a transactionally derived outbox representation for independent Run projection; its digest must equal the operation outcome, and a divergent repeated completion or event payload is corruption.

The model outcome commits before its response or tool results append to Session. Every Session append uses a stable identity derived from the committed operation and content role, accepts an exact digest retry idempotently, and rejects reuse with divergent content. Recovery replays the committed outcome through that same append frontier.

`baton_runs.transcript_json` is deleted unless restart evidence proves a bounded recovery projection is required. If retained, it is explicitly disposable, keyed to an exact Session revision, and never conversation authority. No semantic lifecycle event carries the full growing transcript.

### Cost follows meaning

Durable event count is `O(Runs + model calls + tool calls + lifecycle transitions)`, independent of provider chunk count. Stored bytes are `O(input + normalized output)`, not `O(chunks)` and not `O(turns squared)`. Incremental streaming and preview retention are bounded by one normalized in-flight response plus the explicit preview cap and are independent of provider fragment count. The model-facing Session context grows or compacts under its separate Session and Compaction contracts.

### Honest crash semantics

The existing `provider-idempotent` replay label is not proof of provider idempotency. No exactly-once provider-call claim is allowed until the durable operation key is demonstrably carried as a provider request idempotency identity and tested through a crash.

If the provider cannot prove idempotent admission, crash-before-commit is explicitly at-least-once or `needs-resolution`. Once the response commit exists, recovery never calls the provider again.

## Ownership

### Baton Core

Baton Core owns provider-part normalization and construction of one completed Effect AI response.

- Empty text, reasoning, and tool-parameter deltas with no meaningful metadata are discarded at ingress.
- Adjacent compatible deltas are accumulated rather than retained as one object per transport fragment.
- Tool parameters remain staging data until one complete schema-validated tool call exists.
- The response builder materializes bounded preview state and one final normalized response.
- Direct `Agent.stream` may keep a process-local raw-part observation API for standalone callers, but raw parts are not Runtime execution facts.

### Baton Durable Runtime

Runtime owns model-operation scheduling, fencing, recovery, the semantic Run journal, and post-commit publication.

- A durable model operation executes as an Effect producing `CompletedModelResponse`, not as a replayable stream of chunks.
- Runtime persists one response outcome and one semantic response event.
- Runtime never includes Core `ModelPart` in `RunEvent` or Run-tree history.
- Attempt/retry lifecycle events remain durable only when replay changes a user-visible or recovery decision. Raw telemetry belongs in the telemetry sink.
- Tool progress follows the same rule: bounded live preview is disposable; tool start, terminal result, uncertainty, approval, and failure are durable.

### Rika Baton Adapter

`@rika/baton-execution` maps semantic Baton events to disposable product projections.

- Durable projection consumes `ModelResponseCommitted`, tool lifecycle, child lifecycle, approval, usage, and terminal events.
- It never reconstructs completed response content from transport deltas.
- Generic batch application remains useful for replay pages and simultaneous semantic events; model-fragment-specific batching is deleted.
- Turn watching retains only the latest change/checkpoint required for completion, not the full stream of projection changes.

### Rika Server And Terminal

The Server may install Baton's optional scoped preview observer and forward bounded preview snapshots directly to connected clients.

- Preview never enters the Rika transcript repository or projector checkpoint.
- The client stores it as a tentative overlay keyed by the full attempt identity.
- The durable committed projection clears or replaces the overlay.
- Disconnect, overflow, dropped frames, and restart may remove the overlay without recovery work.
- Cancel and approval remain express control operations independent of preview traffic.

## Target Contracts

Names may be refined while implementing, but the ownership and state distinction may not change.

```ts
interface CompletedModelResponse {
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly attempt: number
  readonly content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>
  readonly usage?: Response.Usage
  readonly finishReason?: Response.FinishReason
  readonly digest: string
}

interface ModelPreview {
  readonly runId: string
  readonly attemptFence: number
  readonly turn: number
  readonly modelCallId: string
  readonly modelAttemptId: string
  readonly revision: number
  readonly content: ReadonlyArray<Response.Part<Record<string, Tool.Any>>>
  readonly truncated: boolean
}

interface ModelPreviewSlot {
  readonly offer: (preview: ModelPreview) => Effect.Effect<boolean, never>
}
```

Baton owns the optional scoped slot. The model fiber performs only one total, non-blocking replacement offer into a fixed conflation slot; it never invokes application observer code. A separate scoped drain fiber calls the host observer, isolates its failure, and may drop updates. Cadence and size limits apply before constructing or encoding a cumulative preview snapshot. A slow, dying, or absent observer is behaviorally identical to no observer.

The durable response event is small and complete:

```ts
interface ModelResponseCommitted {
  readonly _tag: "ModelResponseCommitted"
  readonly turn: number
  readonly operationId: string
  readonly response: CompletedModelResponse
}
```

`TurnCompleted` becomes a boundary fact containing turn identity, response/operation identity, usage, finish reason, and any required Session commit identity. It does not contain `Prompt.Prompt`.

The Runtime store needs one atomic operation rather than per-fragment `emitAgentEvent` calls:

```ts
interface CommitModelResponse {
  readonly claim: ExecutionClaim
  readonly operation: DriverOperation
  readonly outcome: CompletedModelResponse
  readonly checkpoint: DriverCheckpoint
  readonly event: ModelResponseCommitted
}
```

The operation outcome is canonical. `ModelResponseCommitted.response` is its transactionally derived outbox copy for tree projection, and the store verifies their digests are identical before commit.

All supported stores implement identical compare-and-set, idempotency, transaction, and post-commit notification semantics.

## Implementation Order

### 1. Freeze the failure with non-vacuous characterization

Before changing contracts, add a deterministic scripted model that emits the same response as one part and as 10,000 parts with half of them empty.

Record for memory and SQLite Runtime:

- durable event count by tag;
- SQL transaction and post-commit notification count through an instrumented store seam;
- final Session context and terminal response;
- Rika transcript commits and final units;
- retained normalized part count and encoded bytes;

The high-fragment fixture must fail against current production behavior. Include thousands of tiny tool-parameter fragments. A terminal-answer-only test is vacuous.

Add a direct proof for the current durable stream replay hole: the journaled model-operation outcome must contain the normalized completed response, and replay must not depend on an array accidentally produced by a test stub.

### 2. Build one normalized response owner in Core

Refactor `packages/core/src/agent/model-turn.ts` and the model driver boundary.

- Replace `transformedParts.push(part)` with a response builder that coalesces adjacent compatible content.
- Suppress empty deltas before Core event creation, middleware escape, preview, and telemetry accounting unless metadata itself carries a required fact.
- Preserve exact transformed tool-call validation, retry barriers, finish capture, and usage. Missing usage or finish remains absent or follows the existing typed truncated-stream failure; the builder never fabricates a terminal fact.
- Replace provider adapters that repeatedly concatenate tiny tool-parameter fragments, including the Bedrock response adapter, with the same incremental builder discipline.
- Produce `CompletedModelResponse` once.
- Keep standalone raw streaming, if retained, outside the durable result contract.

Prove one-part and fragmented responses normalize identically, including reasoning, text, multiple tool calls, provider-executed calls, metadata, finish, and usage.

### 3. Correct the durable model operation

Refactor `packages/core/src/agent/model-turn-driver.ts`, `packages/core/src/durable/driver-interpreter.ts`, and Runtime execution hosting.

- Before provider contact, atomically schedule the immutable prompt/input identity, operation key, pending checkpoint, attempt fence, and consumed steering batch.
- Drain the provider stream inside one model operation Effect.
- Make the completed normalized response the operation result recorded by the journal.
- On recorded success, replay that response without contacting the provider.
- Prove or remove the `provider-idempotent` claim.
- Preserve the rule that incomplete tool parameters never schedule a tool.

Fault-inject before scheduling, after scheduling and before provider contact, during the provider call, and immediately before and after outcome recording. Recovery must reuse the scheduled input exactly. A committed result must drive the same tool calls exactly once after restart.

### 4. Add atomic semantic commit and post-commit outbox

Replace blind per-Core-event persistence in every RunStore.

Affected implementations include memory, SQLite, PostgreSQL, and MySQL even though Rika composes SQLite.

- Add the fenced idempotent model-response completion transaction; steering was already consumed by scheduling and is not touched here.
- Append the semantic outbox event, record the canonical operation outcome, and advance the post-operation driver checkpoint together.
- Require the outbox response digest to equal the canonical operation outcome and reject divergent repeated completion.
- Append committed responses and later tool results to Session under stable operation-derived entry identities; accept exact retries and reject divergent digests.
- Classify `baton_runs.transcript_json` as a disposable Session-revision-keyed recovery projection or delete it; it may not remain conversation authority.
- Buffer notifications and publish only after commit.
- Remove the SQLite `emitAgentEvent` path that can publish inside a transaction.

Prove a forced SQL failure after event insertion but before commit is invisible to subscribers and replay.

### 5. Make Run history semantic and linear

Update Runtime event schemas, tree codecs, inspection, usage folding, transports, fixtures, and feature docs.

- Delete durable `ModelPart`.
- Add `ModelResponseCommitted`.
- Remove full transcript payloads from `TurnCompleted`, `Completed`, and terminal Run events where the exact response or Session identity already owns the fact.
- Stop deriving raw usage from redundant lifecycle payloads when the committed operation already owns it; retain only the one canonical raw-usage account.
- Keep child, approval, wait, cancellation, uncertainty, tool terminal, compaction, steering, and Run terminal facts.
- Ensure transport event IDs and cursors still name only committed semantic events.

Run-tree replay after completion must reconstruct the same projection from semantic events alone.

### 6. Add the bounded observer tap

Add one optional preview observer at the Baton execution-host boundary.

- Normalize before observing.
- Conflate updates by attempt identity.
- Apply cadence and size limits before materializing or encoding a cumulative snapshot.
- Use one bounded replacement slot, not an append queue.
- The model fiber performs only a total non-blocking offer; a separate scoped drain fiber isolates slow or failing host observation.
- Close and clear on retry, cancellation, failure, handoff, response commit, and scope exit.

Do not add persistence, cursors, recovery, delivery acknowledgment, or a second Runtime event vocabulary for previews.

### 7. Replace Rika fragment projection

Update `packages/baton-execution`.

- Project completed assistant text, reasoning, tool calls, and usage from `ModelResponseCommitted`.
- Delete raw `ModelPart` cases and model-fragment flush rules.
- Delete repeated streamed-text chunk searching and concatenation from durable projection.
- Replace `root-turn-owner`'s `changes[]` retention with one latest-change/checkpoint slot.
- Retain `applyAll` for bounded semantic replay batches.
- Persist one Rika projection change for one committed response rather than one change per preview.
- Restore from a semantic cursor and projector checkpoint without raw fragments.

Update direct projector fixtures before widening to product-store tests.

### 8. Add the Rika tentative overlay

Wire the optional observer only in the Rika Server composition.

- Forward the latest bounded preview through the existing host feed as a non-durable presentation frame.
- Keep one overlay per active attempt in client state.
- Render it using bounded physical rows.
- Replace it with committed transcript units on the matching semantic event.
- Reject stale-fence and stale-attempt frames.
- Clear it on reconnect, resync, cancel, failure, and terminal state.
- Conflate preview by key and render only the latest value at display cadence; do not queue and apply stale previews.
- Deliver each durable projection once. Delete callback-plus-return replay/deduplication and keep only one rare durable-gap `ResyncRequired` path.

Deleting or duplicating every preview frame in tests must leave durable Rika and Baton state identical.

### 9. Delete compensating machinery and synchronize docs

Delete, rather than deprecate:

- Runtime `RunEvent.ModelPart` and its schemas/codecs/tests;
- transcript-bearing Runtime lifecycle payloads;
- Rika raw-fragment projector cases;
- model-fragment-specific projection batching and flush exceptions;
- tests that equate fragment count with durable event count;
- the root-turn watcher's accumulated array of every projection change;
- any preview persistence, cursor, checkpoint, or replay experiment created during implementation;
- callback-plus-return projection redelivery and its deduplication Set;
- preview FIFO batching and server patch-merge machinery used as fragment-pressure compressors;
- obsolete overflow tuning justified only by fragment traffic, while retaining bounded queues, message limits, durable revision gaps, and one correct resync path.

Update Baton `CONTEXT.md`, `docs/features/agent-loop.md`, `docs/features/runtime.md`, `docs/features/transport.md`, and `docs/features/session-and-compaction.md`. Update Rika `CONTEXT.md`, durable-execution, local-persistence, transport, transcript, and terminal feature docs whose contracts change.

### 10. Reset pre-release storage and release in dependency order

This is a greenfield breaking schema change.

- Let every live Run settle before touching profile data.
- Back up any developer profile that must be inspected later.
- Bump Baton's actual SQL schema identity/checksum, not only the TypeScript event union, so Rika's owned runtime recovery archives the incompatible execution database deliberately.
- Preserve completed Rika transcript units. Do not bump Rika's projection version merely because Baton's event schema changed; doing so would hide old completed content after its source Run history is archived.
- Any pre-upgrade active execution link must settle before rollout or reconcile explicitly to unavailable/failed after archive; it must never hang.
- Decide and document retention or deletion of the archived Baton database, because archive alone does not recover disk space.
- Do not ship an old-event compatibility reader or an online raw-event compactor. If active-Run preservation becomes mandatory, stop and build a one-off offline converter rather than a permanent dual decoder.
- PostgreSQL and MySQL require an explicit drain and new baseline/migration because they do not use Rika's SQLite archive adapter.
- Start acceptance from the new Baton baseline schema while proving completed Rika product transcripts remain readable.
- Release Baton first through its canonical workflow.
- Pin the published Baton release in Rika, remove all source aliases or temporary overrides, and release Rika through its canonical workflow.

## Fault And Scale Proof Matrix

### Chunk invariance

Run identical semantic output split into 1, 10,000, and adversarial empty/cumulative fragment patterns. Assert:

- identical normalized response digest;
- identical Session context;
- identical durable event tags and count;
- identical final Rika transcript;
- one Rika durable response projection;
- database growth within a constant envelope independent of fragment count.

### Transaction visibility

Inject failure at each point of model commit, including after event insertion and before transaction completion. An attached subscriber sees no rolled-back event. Replay exposes exactly the committed prefix.

### Restart frontier

Kill execution:

- before operation scheduling;
- after scheduling consumed steering and before provider contact;
- during provider execution;
- before model-operation completion commit;
- during completion commit;
- after commit and before notification;
- after notification and before Rika projection;
- after Rika projection and before product acknowledgment.

Reopen both stores and compare the durable tree, Session, operation state, driver checkpoint, and Rika transcript with a no-crash run.

### Tool exactly-once after response commit

Commit a response containing tool calls, kill before the Agent consumes the response, restart, and prove:

- the provider is not called again;
- each validated tool call is scheduled once;
- replayed tool results enter Session once and in authored order.

### Session append frontier

Kill execution after response completion and before Session append, after Session append and before the next driver or turn checkpoint, and after an exact Session retry. Recovery must produce one entry under the same operation-derived identity. An exact digest retry succeeds; a divergent digest fails typed and never advances the Session leaf.

### Preview non-authority

Drop, duplicate, reorder, and delay every preview. Send old-fence frames after retry and cancellation. Assert byte- or semantic-equivalent durable stores and final projection. The commit must clear the overlay.

### Linear turns

Run increasing fixed-size turn counts and measure Baton event JSON, database pages, Rika units, and checkpoint bytes. Growth must be linear. This catches reintroduction of a full transcript into every lifecycle event.

### Idle and retention

Use the packaged product and a real long-running scripted session.

- CPU must return to idle after the model/tool boundary becomes idle.
- Kernel CPU is reported separately from Server projection work.
- Measure retained normalized bytes, object counts, and non-reclaimable footprint across turns.
- Do not fail on RSS alone; allocator-reclaimable pages may remain resident.
- No retained-state slope may track provider fragment count.

### Pre-upgrade profile recovery

Open a copied pre-upgrade profile after draining Runs. Prove the incompatible Baton database is archived, completed Rika transcript units remain readable, active links settle explicitly rather than hanging, and archived-file retention follows the documented decision.

### Control under preview flood

While generating maximum preview traffic, cancel and approval commands must reach their owner without waiting behind preview. The preview may be dropped; control may not.

## Completion

The plan is complete only when:

- no provider transport fragment is a durable Runtime event;
- one committed response is the replayable model-operation result;
- Run events and cursors expose committed semantic facts only;
- Baton never publishes an uncommitted event;
- full transcript snapshots no longer repeat in Run history;
- Rika durable projection does not consume preview or raw model parts;
- preview can be removed entirely without changing execution behavior;
- chunk-invariance, crash, replay, linear-growth, packaged CPU, and retained-memory proofs pass;
- replaced APIs, schemas, batching exceptions, projector paths, fixtures, and docs are deleted rather than retained as compatibility layers;
- Baton and then Rika pass their full repository and publication gates from exact release SHAs.
