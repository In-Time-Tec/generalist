# Session and compaction

`Session` is the authoritative conversation log; ordinary execution appends entries, and its current root-to-leaf path projects the next model prompt. Optional compaction replaces only that projection with a self-contained checkpoint while preserving the lossless log.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Agent, Compaction, Session } from "generalist"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "assistant", instructions: "Be concise." })
const services = Layer.mergeAll(
  TestModel.layer([TestModel.text("I will remember that."), TestModel.text("Your name is Ada.")]),
  Session.layerMemory,
  Compaction.layer({ contextWindow: 64_000, keepRecentTokens: 8_000 }),
)

const program = Effect.gen(function* () {
  yield* Agent.run(agent, "My name is Ada.", { sessionId: "user-42" })
  return yield* Agent.run(agent, "What is my name?", { sessionId: "user-42" })
}).pipe(Effect.provide(services))
```

The shared `sessionId` makes the second run continue the first. Removing it disables Session even if `SessionDirectory` is available.

## What runs

```text
Agent.run(..., { sessionId: "user-42" })
├── SessionDirectory.acquire("user-42")
├── SessionStore.path()
│   └── Session.buildContext(root-to-leaf path)
├── prepend current derived system message
├── sync non-system request prefix into Session
├── Compaction.maybeCompact()
│   ├── microcompact successful tool results
│   └── maybe cut → summarize → appendCheckpoint()
├── model.generateText(projected Prompt)
└── commit ModelResponse + operation/event/checkpoint
```

## Data flow

```text
Message(id: "m1", user: "My name is Ada.")
ModelResponse(id: "r1", assistant: "I will remember that.")
Compaction(id: "c1", projectedHistory: [checkpoint, recent])
Message(id: "m2", user: "What is my name?")
        │ buildContext()
        ▼
Prompt [checkpoint, recent, user: "What is my name?"]
        │ withDerivedSystem()
        ▼
Prompt [system: current instructions, checkpoint, recent, user]
```

`buildContext` starts at the latest `Compaction` or `Handoff` and appends descendants. `buildMemoryContext` ignores both boundaries and projects the lossless conversation path.

## Checkpoint lifecycle

```text
idle
 ├─ threshold false / custom None ───────────────▶ idle
 └─ threshold or overflow ─▶ Started
       ├─ unchanged / successful None ─▶ Skipped
       ├─ work or pre-commit failure ──▶ Failed
       └─ changed ─▶ checkpoint committed ─▶ Applied
```

The default strategy first bounds successful tool outputs, then keeps a safe recent suffix and summarizes the older head. Cut points never separate a tool call from its result. When summaries are not worth a model call, `Compaction.layerTruncate(maxTokens)` (with `Tokenizer`) or `Compaction.layerTruncateEstimated(maxTokens)` drops the oldest turns instead.

## Invariants

### Session-owned components

A retained plan or workspace reference can outlive one Run without moving into an application cache. The existing durable component descriptor accepts `scope: "session"` with explicit `access: "session-owner"` and `inheritance: "none"`. The same registry, schema and handler pins, JSON byte bounds, deterministic transitions, and command receipts apply. This is a Runtime-backed lifetime; process-local Sessions do not provide durable component storage.

An accepted component command commits its new value and immutable receipt through the Run checkpoint and the owning Runtime Session in one canonical transition. The next Run hydrates that Session materialization. A crash before the later tool-result publication preserves the accepted mutation but does not invent a successful tool result; replay returns the accepted receipt without repeating the transition. Missing registrations or incompatible pins fail before dispatch.

Only the fenced Run writer for that Session may accept a mutation. Child Runs use independent Sessions and do not inherit these values or a parent write capability. A fork copies the selected values into its own Session. Rewind restores the selected values while retaining accepted receipts, incurred costs, and abandoned history. Rewinding before first use restores the retained initial value; retrying an abandoned command returns its original result without reinstating its later value. An initial component snapshot also preserves values inherited from earlier Runs when branching before the current Run's first checkpoint.

`Tasks` remains Run-scoped, including its existing explicit read-only child inheritance. Session components do not change task-list ownership, introduce a second registry, schedule work, restore external files, or roll back third-party effects.

The scripted [Session tool recovery test](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/core/durable/driver/layer-for-run.test.ts) uses the public component API, interrupts execution after the accepted mutation, and reopens a fresh object Runtime Layer before continuing into a second Run. Shared runtime-driver expectations cover branch restoration and command receipt retention. The [packed consumer](https://github.com/In-Time-Tec/generalist/blob/main/scripts/package-smoke-components.ts) also registers, mutates, and reads a component across four Runs and fresh Runtime Layers using only package exports under Bun and Node. These use scripted models and a shared test bucket; they do not certify a cloud storage provider or simulate durable external files.

### Declare and use a Session component

Import `generalist/components` to define application-owned state. This composition fragment adds a retained counter and its two Effect AI tools. Provide the resulting environment when registering the Agent and on each recovery host, along with an activated object Runtime, a model, and tool authorization. Production storage uses the existing S3 or native R2 Layer; `generalist/testing/durability` provides a test-only simulator and `layer(client)` for fresh-Layer tests.

```ts
import { Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, DurableDriver } from "generalist"
import * as Components from "generalist/components"

const counter = Components.make({
  descriptor: {
    version: "1",
    key: "counter",
    instance: "default",
    schemaVersion: "1",
    handler: "increment",
    handlerVersion: "1",
    scope: "session",
    access: "session-owner",
    inheritance: "none",
    branch: "restore",
    redaction: "visible",
    maxStateBytes: 64,
    maxCommandBytes: 64,
    maxReceiptBytes: 4096,
  },
  state: Schema.Int,
  command: Schema.Int,
  initial: 0,
  transition: (state, amount) => state + amount,
})

const add = Tool.make("counter_add", {
  parameters: Schema.Struct({ amount: Schema.Int }),
  success: Schema.Int,
  failure: Schema.Union([DurableDriver.DriverError, DurableDriver.DriverStateInvalid]),
}).annotate(Components.CommandTool, counter.registration)
const read = Tool.make("counter_read", {
  parameters: Schema.Struct({}),
  success: Schema.Int,
  failure: DurableDriver.DriverStateInvalid,
})
const toolkit = Toolkit.make(add, read)
const agent = Agent.make({ name: "counter-assistant", toolkit })
const environment = Layer.mergeAll(
  Components.layer([counter.registration]),
  toolkit.toLayer({
    counter_add: ({ amount }) => Components.command(counter, { command: amount }),
    counter_read: () => Components.read(counter),
  }),
)
```

`Components.command` encodes the typed command and uses the active tool's durable operation identity when `id` is omitted. Keep the `CommandTool` annotation on mutation tools: it selects the existing receipt-backed replay policy. Calls outside a tool must supply an explicit stable `id` and still execute inside an active Agent Run. `Components.read` returns the current schema-decoded value without appending a command or receipt. Both reject missing registrations or Session ownership; neither exposes a setter or a Session writer service.

The same Session ID retains the counter across Runs; a different Session starts from zero. After rewind, `read` returns the restored value, while an exact retry of an abandoned command still returns its original immutable receipt result. Byte bounds also apply across successive Runs, so a full receipt budget rejects new mutations instead of growing indefinitely. The API is `@experimental`.

### Conversation and compaction

- `RunOptions.sessionId` is the only caller-supplied Session identity; setup acquires one exact store and same-ID lane for the Run scope and uses it for sync, compaction, resume, and same-run handoff.
- `Session.layerMemory` keeps per-ID stores for its Layer lifetime, serializes ordinary Runs for one ID, and permits different IDs concurrently; IDs never share entries, leaves, or checkpoints.
- The shared object engine provides durable keyed Sessions; conversation projections join execution transitions in the canonical partition commit.
- Session is the only model-history authority. Run rows, events, records, and operations are a separate crash-recovery journal, never model context or a transcript cache; deleting execution records cannot erase conversation.
- Before a provider call, Core syncs the complete non-system request prefix, including user or steering input, with stable IDs derived from logical turn, projection root, absolute conversation position, and role.
- The projection root is the latest compaction checkpoint or initial root. A rewritten projection cannot reuse an earlier projection's position identity.
- Sync progress uses Session entry identity, not message count. Adjacent equivalent text parts are coalesced; ambiguous alignment or divergence fails typed instead of guessing.
- Sync diagnostics contain only session ID, bounded counts, alignment/common-prefix facts, final entry tag, and first-divergence roles, part types, and digests—never raw prompt, message, or tool payload text.
- A normal append may use an exact `id` and `expectedLeafId`; an identical identity, parent, and payload retry does not advance sequence or leaf.
- Reusing an entry ID with changed parent or payload fails `SessionConflict` with `entry-id-reused`. Exact retries remain valid below an active descendant, but not after abandoning that branch; ambiguous appends are retried exactly.
- Runtime rewind first copies the complete discarded Session continuation to the retained branch, then removes that suffix from the named source Session and resets its leaf to the checkpoint. Ordinary Session mutation remains append-only; the explicit rewind transition makes the source a replayable prefix without losing the discarded future.
- Every admitted framework tool call has exactly one matching terminal result. Duplicate, mismatched, and unresolved histories are rejected before provider invocation, and successful Run settlement is rejected while calls remain unresolved.
- Tool settlement appends proven, unknown, cancelled, or failed outcomes in the same object-journal transition that settles the Run.
- A terminal model operation atomically commits one normalized `ModelResponse`, compact operation reference, exactly one semantic event, and post-usage driver checkpoint. Operation results and response events retain Session/entry identity, input parent, attempt facts, usage, finish reason, and digest—not response content; `Runtime.resolveModelResponse` verifies and hydrates the exact entry. Retries must match identity, parent, payload, and digest; later sync does not duplicate it.
- Internal provider retries remain tentative. Provider HTTP envelopes—including URLs, query parameters, headers, and credentials—never enter Session snapshots or completion state.
- Token charge counts terminal reported usage plus every failed-attempt usage once, falling back to a context estimate only without terminal usage. Replay does not recharge; exhaustion still commits the paid response and zero budget, then stops before its tools execute.
- System instructions are derived for the active Agent on each turn, never stored in Session or checkpoints, and are added only to the live model prompt. Session reconciliation permits these transient system messages at turn boundaries while requiring durable projected messages and non-system descendants to remain ordered. Frequently changing instructions invalidate provider prompt-cache prefixes.
- A `Handoff` stores deterministic conversation-only `projectedHistory`, source parent, stable identity, and target. Durable stores atomically import/verify it with handoff success, checkpoint advance, and executable switch; divergent retries change nothing.
- Runtime recovery rebuilds handoff context from Session, not Run records. Spawned children and fan-out members use invocation-derived isolated Sessions; replay reattaches to the same child Session.
- Compaction is optional and only shortens an active Session projection; Session remains authoritative without it.
- An explicit `RunOptions.compaction.contextWindow` wins. Otherwise compaction resolves the active provider/model through `ModelCatalog`; bundled models need no catalog Layer, provided catalog overrides remain authoritative, and known but unlisted models use a conservative 32,768-token window after one warning. Identity-less custom `LanguageModel` services leave fallback ownership with the Compaction Layer.
- Every changed Session-backed projection is one self-contained checkpoint: stable ID, expected parent, exact conversation-only projection, ordered telemetry outbox, optional summary, and optional commit linking compaction, summary call, and checkpoint with before/after measurements.
- Checkpoint projection, telemetry, and commit persist atomically before Chat/path advance. Only exact retries are idempotent—even below descendants; changed identity, parent, projection, summary, telemetry order/payload/delivery ID, or commit conflicts.
- A failed or interrupted remote checkpoint append is ambiguous and stays locally unacknowledged. Recovery can replay an existing checkpoint's outbox but cannot recreate a lost prepared checkpoint; consumers acknowledge idempotently by `(sessionId, deliveryId)`.
- Without `Tokenizer`, counts are Generalist estimates and image file parts cost a bounded 1,600 tokens rather than encoded-data size.
- Reported input usage is a baseline only for append-only descendants of that exact prompt; rewrites or replacement finishes without valid input usage invalidate it.
- An unchanged threshold pass is suppressed only while usage and conservative plain-JSON context revision match. Non-plain, lossy, or throwing values fail open; overflow bypasses and clears suppression on success, failure, or interruption.
- A custom strategy returning `None` before `Compaction.withLifecycle(request)` opens no lifecycle; after lifecycle start, successful `None` or unchanged work emits `CompactionSkipped`.
- `CompactionStarted` precedes work with trigger and known pre-application measurements. Changed Session-backed work commits the exact `CompactionApplied` event before live publication; it identifies `microcompact` or `summarize` and carries the checkpoint-backed commit. Failure or interruption emits `CompactionFailed`, never `Applied`.
- Summary calls use the normal model lifecycle with purpose `compaction-summary`; `ModelCallStarted` carries `compactionId`, and the applied commit carries `summaryModelCallId` when used.
- The dedicated summary-model Layer is memoized per owning scope. Durable recovery reconstructs the pinned compaction service and exact summary-model registration, never current configuration.
- Standalone Core enforces branches and idempotency but not distributed fencing. Hosted Runtime claims a Session-global monotonic epoch and binds every mutation to epoch, Run, worker, and attempt; readers are read-only and stale writers fail before mutation or idempotent success.

## Related

- Source: `packages/generalist/src/core/context/session.ts`, `packages/generalist/src/core/context/session-projection.ts`, `packages/generalist/src/core/context/session-sync.ts`, `packages/generalist/src/core/agent/session/`, `packages/generalist/src/core/agent/compaction-runtime.ts`, `packages/generalist/src/core/turn/compaction.ts`
- Site: `/docs/learn/sessions-and-history`, `/docs/guides/compaction`
- Decisions/tradeoffs: [Authoritative session history](../decisions/authoritative-session-history.md)
