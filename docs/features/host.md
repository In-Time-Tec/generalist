# Host

`generalist/host` is the experimental in-process product boundary over the durable Runtime. A Session accepts conversational input while its current Run is busy, keeps pending input editable, and starts each accepted instruction in its own Run. Host also starts configured typed Agents directly, controls root Runs, and follows a Session-wide event stream. Runtime remains the only execution, persistence, replay, and cancellation authority.

## Usage

This composition fragment expects an object-backed Runtime activated inside its host scope; see [object durability](./durable-stores.md).

```ts
import { Effect, Layer, Schema } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { Host } from "generalist/host"
import * as Durability from "generalist/durability"

const triage = Agent.make({
  name: "triage",
  output: Schema.String,
})

const program = Effect.gen(function* () {
  yield* Durability.activate
  const host = yield* Host.make({
    agents: { triage },
    revision: "support-build-2026-09-08",
    limits: { tree: { maxDepth: 3, maxSessions: 32 }, concurrency: { agents: 4, tools: 8 } },
  })
  const attachment = yield* host.attachments.put({
    data: new TextEncoder().encode("attachment"),
    mediaType: "application/pdf",
    filename: "attachment.pdf",
  })
  const session = yield* host.sessions.create({ title: "Support inbox", agent: "triage" })
  const receipt = yield* session.submit("Triage ticket 42: cannot sign in", { commandId: "ticket:42:submit" })

  const events = yield* host.events.subscribe(session.id)
  const metadata = yield* session.inspect
  return { sessionId: session.id, receipt, metadata, events, attachment }
})

declare const runtime: Layer.Layer<Durability.RuntimeServices>
declare const model: Layer.Layer<LanguageModel.LanguageModel>
declare const blobStore: Layer.Layer<BlobStore.BlobStore>

Effect.runPromise(
  program.pipe(
    Effect.scoped,
    Effect.provide(Layer.mergeAll(runtime, model, Permissions.layerAllowAll, Approvals.layerAutoApprove, blobStore)),
  ),
)
```

`Host.make({ agents, revision, limits, tools?, plugins? })` requires Runtime, Approvals, Permissions, every configured Agent service, and tool handlers. `agents` is a named registry whose values are the exact typed Agent definitions; `revision` identifies the deployed build and is included in the existing executable pins. Hosts with Agents also require `LanguageModel`; a Tool-only Host does not. Host limits are pinned at construction and are never widened by a client request.

The Agent fragment above admits work and returns a receipt, not the Agent's answer. The declared model and Runtime Layers determine credentials and execution; no scripted or live provider is configured there. Keep the activated host scope alive while work executes.

## Independent Tool Runs

Set `Agent.make({ name: "coder", toolkit: workspaceTools, toolExecution: "background" })` when the Agent should continue after admitting work instead of waiting for each handler. Register those same Effect AI Tools with `Host.make({ agents: { coder }, revision: "coder-build", limits, tools: [...] })`. This is a definition fragment: the application supplies the Toolkit handlers, model, authorization Layers, activated Runtime, and scheduler.

The model-visible success schema describes `{ _tag: "ToolRunAdmitted", runId, tool }`, not file contents or a command's final output. The execution registry retains the original parameter, success, and failure codecs, including MCP handler types. The parent can make another model step while the admitted Tool Run remains running. Tool admission has its own durable command identity; it is not memoized as the tool's final answer. Messaging, skill activation, and child/Program admission and observation controls stay inline.

Process-local Core defaults to inline execution. Explicit background mode without a durable Runtime fails before the first model call rather than falling back to local fibers. Unregistered work tools fail closed, including tools discovered after Agent construction.

Background admission applies to framework-executed handlers. Provider-executed built-ins keep their provider result contract; Generalist does not claim to admit a Tool Run for an effect executed inside a model provider.

The Agent's existing authorization runs before admission. A pending admission-time approval still suspends that Agent; the registered Tool Run authorizes its actual execution independently. Background mode does not bypass a custom Agent authorizer or transfer its approval decision to a different policy.

The shared Tool Run executor applies a 60-second deadline to each execution attempt, retains at most 256 KiB per outcome, accepts at most 64 progress events of at most 16 KiB each, and accepts at most 16 artifact references of at most 2 KiB each. These limits enter registered Tool policy identity. Progress over its bound is declined; typed outcomes and admission receipts are never replaced with truncated previews. An unretained outcome or expired external operation remains actionable through the existing unknown-outcome resolution path, not an invented success or automatic redispatch. Deadline expiry requests Effect interruption; it is not proof that an external process stopped, and cannot forcibly terminate an uninterruptible handler. Artifact references do not grant storage access or enlarge the artifact store's own payload limits. Canonical family Tool concurrency and durable storage capacity bound execution and retained admission state.

Use a Tool Run when work must keep its own execution claim after the Run that requested it settles. Register ordinary Effect AI Tool declarations in `tools`, provide their Toolkit handlers when creating the Host, and start them without creating a conversational Session.

This Effect generator fragment assumes an activated durable Runtime and a host scheduler. The `checks` handler is scripted arithmetic: it invokes no model or external service and needs no credentials.

```ts
import { Effect, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Host, ToolIdentity } from "generalist/host"

const checks = Tool.make("checks", {
  parameters: Schema.Struct({ count: Schema.FiniteFromString }),
  success: Schema.FiniteFromString,
}).annotate(ToolIdentity, { implementation: "checks-v1", policy: "checks-policy-v1" })
const handlers = Toolkit.make(checks).toLayer({
  checks: ({ count }) => Effect.succeed(count + 1),
})

const program = Effect.gen(function* () {
  const host = yield* Host.make({
    agents: {},
    revision: "checks-v1",
    limits: { tree: { maxDepth: 0, maxSessions: 1 }, concurrency: { agents: 0, tools: 1 } },
    tools: [checks],
  })
  const run = yield* host.tools.start(checks, { count: 4 }, { commandId: "checks-1" })
  const inspection = yield* run.inspect
  const result = yield* run.await
  return { inspection, result }
}).pipe(Effect.provide(handlers))
```

`ToolIdentity` is required for independent Tool registration. Change `implementation` when handler or executor behavior changes, and change `policy` when permission rules, approval services, a function-valued approval predicate, or the executor's replay-policy selector changes. Boolean `needsApproval` settings also enter the pinned identity automatically. These are deployment identities, not secrets or serialized closures; a new deployment must retain the code and policy for unfinished old pins.

`start` returns after canonical admission, before the handler settles. `result` is the decoded number `5`; the retained input and result use the Tool's encoded schemas. Repeating an identical `commandId` returns the same Run and result without redispatch. Reusing it with different input fails with a canonical `input-conflict`. Keep the command identity after ambiguous admission outcomes.

The handle exposes `id`, `inspect`, replay-then-live `events`, `await`, and `cancel(commandId, reason?)`. It has no Agent `send`, fork, or rewind controls. A declared Tool failure is decoded through its failure schema and returned by `await` as `{ _tag: "ToolRunFailure", failure }`. Approval decisions and unknown-effect resolution use the existing Host approval and operator methods.

Retrieve a Tool Run after reopening the Host with `host.tools.get(tool, runId)`. The registered Tool pin must match the retained executable; lookup performs no admission or dispatch. Agent/Program lookup through `host.runs.get` rejects Tool IDs with `RunKindUnsupported`, as do steering, fork, and rewind. Those controls reject at canonical admission without retaining unusable input. Untyped Program lookup returns the retained Program value.

An optional `parentRunId` sponsors the Tool in the parent's canonical family and inherits its admitted limits. Parent settlement does not release or cancel the Tool's claim. Tool claims use the family's `concurrency.tools` capacity, not Agent concurrency, recursion depth, or `maxSessions`. Running and unresolved tool operations retain capacity until their outcome is known. Sponsorship lives on Run records: a Tool's routing identity creates no Runtime Session row, Session family membership, or Session writer claim, and does not occupy the sponsor's conversational lane.

On a fresh host, register matching Tool declarations, codecs, handlers, and policy again before resuming work. Executable pins identify these deployment dependencies; the journal does not serialize their closures or credentials. If an interrupted external effect has no accepted outcome and cannot safely retry, recovery requires explicit resolution rather than calling the handler again.

Independent Tool handlers and executors can call `NestedOperation.run` without a model. Runtime supplies the claim-bound `NestedOperation.Operations` service at execution time; a captured registration-time implementation cannot replace it. Completed nested requests and outcomes replay under the outer operation's identity and ordinal, while a changed payload fails with `NestedOperation.Divergence`. Interrupted non-idempotent nested effects retain an unknown outcome for explicit resolution.

The executor's `replayPolicy` selector controls the outer Tool receipt when supplied; otherwise the registered Tool policy applies. For a replay-safe outer Tool, an executor that converts `NestedOperation.Suspended` into the existing `Suspend` outcome opens the nested operation's durable Approval wait. After an authenticated decision, a fresh host re-enters the handler and reuses completed nested effects. A `never` outer operation cannot use this automatic re-entry path.

## Surface

```text
host.attachments.put({ data, mediaType, filename? }) -> Media.Ref
host.attachments.get(sha256)                         -> { ref, data }

host.sessions.create({ id?, title?, agent? }) -> SessionHandle
host.sessions.get(sessionId)          -> SessionHandle
host.sessions.snapshot(sessionId)     -> HostSessionSnapshot
host.sessions.history(sessionId, { leafId, limit }) -> SessionHistoryPage
host.sessions.runs(sessionId, { at, before?, rootRunId?, limit }) -> SessionRunsPage
host.sessions.run(sessionId, runId)    -> SessionRunSummary
host.sessions.entry(sessionId, entryId) -> ConversationEntry
host.sessions.list()                  -> HostSession[]
host.sessions.fork(runId, { commandId, atSequence, budget?, programBudget?, substitute? }) -> HostRun<unknown>

session.inspect                      -> Effect<HostSession>
session.snapshot                     -> Effect<HostSessionSnapshot>
session.submit(input, { commandId })  -> QueueReceipt { id, revision }
session.queue.list()                 -> PendingInput[]
session.queue.update(id, input, { commandId, expectedRevision, agent? }) -> QueueReceipt
session.queue.remove(id, { commandId, expectedRevision }) -> QueueReceipt
session.message(input, { commandId }) -> QueueReceipt (requires authenticated SessionSender)
session.stop({ commandId })          -> void
session.resume({ commandId })        -> void
session.close({ commandId })         -> void

host.runs.start(sessionId, agent, typedInput, { idempotencyKey? })
  -> { id, await, events, send }
host.runs.startByName(sessionId, agentName, untrustedInput, { idempotencyKey? })
  -> { id, await, events, send }
host.runs.list(sessionId)             -> root Run inspections
host.runs.inspect(runId)              -> Runtime inspection, including Inspector snapshot fields
host.runs.send(runId, prompt, { policy?, from?, idempotencyKey? })
                                      -> { entryId, sequence }
host.runs.cancel(runId, commandId, reason?)       -> void
host.runs.rewind(runId, { commandId, toSequence, budget? }) -> void

HostRun.wait({ runs?, messages?, commandId, timeout? })
                                      -> RunSettled | Message | Timeout

host.events.subscribe(sessionId, cursor?)
  -> Effect<Stream<HostEvent>, SessionError>

host.approvals.resolve(runId, token, decision, operator, commandId) -> void

host.operator.explain(runId) -> Explanation
host.operator.retry(runId, operator, commandId) -> void
host.operator.wake(runId, operator, commandId) -> void
host.operator.resolveUnknown(runId, operationId, resolution, operator, commandId) -> void
host.operator.extendBudget(runId, delta, operator, commandId) -> void
```

`runs.start` accepts only the exact Agent values passed to `Host.make`; the Agent's input and output Schemas determine the input and `await` types. The returned `id` is Runtime's `runId`. Runs started with the same Session and `idempotencyKey` retain Runtime's existing idempotency behavior.

`HostRun.wait` is a model-facing control used from the active Agent tool context. It accepts at most 32 same-family Run IDs and an authenticated-message selector, and it requires a stable `commandId`. Registration and the already-arrived check share the Runtime wait transition, so a terminal Run or pending message cannot be missed across a host restart. A `Message` result includes its durable inbox cursor; a retry does not consume it again. `Timeout` closes only this wait, while sibling provider tool calls remain barriers until their own results are available. Use `await` when the host only needs terminal output.

`HostRun.wait` is a model-facing control used from the active Agent tool context. It accepts at most 32 same-family Run IDs and an authenticated-message selector, and it requires a stable `commandId`. Registration and the already-arrived check share the Runtime wait transition, so a terminal Run or pending message cannot be missed across a host restart. A `Message` result includes its durable inbox cursor; a retry does not consume it again. `Timeout` closes only this wait, while sibling provider tool calls remain barriers until their own results are available. Use `await` when the host only needs terminal output.

`runs.startByName` is the serialized-host boundary used by `generalist/server`. It finds one configured Agent by name and decodes the unknown input with that Agent's input Schema before starting it. Unknown names and invalid inputs remain typed Host failures. Approval and operator methods are the same Runtime operations with no second decision or recovery authority; every mutation requires the caller identity recorded by Runtime.

## Conversational queue

Create a Session with a configured Agent name before calling `submit`. Session submission and pending edits accept conversational instructions as a string or Effect AI `Prompt.Prompt`; they do not decode an Agent's typed input Schema. Use `runs.start` or `runs.startByName` for schema-defined Agent inputs. Only Agent selections are supported: Programs are rejected, and direct Tool selection is not implemented (#460).

Canonical Session metadata contains `selection`, `queue`, and an optional `activeRunId`. Each pending item retains its prompt, revision, executable reference, manifest, registrations, and selected tree policy and budget. The first input is atomically promoted into a fresh Run when the Session is idle. Later inputs remain FIFO pending items until the active Run terminalizes; terminalization and the next promotion commit together. A pending item is not a Run inbox entry and has no Run ID yet.

`create` and `get` return a `SessionHandle`. Its `inspect` and `snapshot` properties are lazy Effects: yield them to read current committed state rather than treating the handle's initial metadata as a subscription. `queue.list()` reads the current pending items; `inspect` returns the canonical metadata with its `queue` array.

Update or remove an item using its observed `expectedRevision` and a new `commandId`. An update can replace that item's Agent selection with `agent`; omitting it retains the item's pinned selection. Editing does not move the item in FIFO order or change the active Run. If an edit, removal, or promotion wins first, a stale revision fails `SessionQueueConflict`; reload the queue instead of silently retrying against a newer revision.

Every accepted queue command returns an immutable `{ id, revision }` receipt. Preserve both command identity and content across ambiguous outcomes: an exact retry returns the original receipt even after promotion, removal, or reopening. Reusing the command identity with changed content conflicts. The receipt acknowledges the command, not current membership or completion; read `inspect` or `queue.list()` for current state.

An edit's requested Agent name is part of its command identity; its registered executable is resolved only for a new admission, after receipt reconciliation. An exact retry still returns its accepted receipt if that registration later changes or disappears. New edits must pass the current Host's Agent allowlist and revision checks. HTTP authentication and resource authorization apply to every request, including retries.

The queue permits at most 64 pending entries and 1 MiB of encoded pending input, including pinned settings and registrations. Undelivered `session.message` entries in the active Run inbox count against this retention bound too, so cancellation can retain them without overflowing the queue. A mutation exceeding a bound fails without changing the queue. Exact-Run steering still has its own inbox bound. Canonical object state, not the Session handle or host memory, owns recovery. Use fresh namespaces; there is no compatibility reader for retired durable enqueue state.

`submit` schedules a separate conversational Run. `message` instead reaches the active Run at a safe model boundary, or queues a fresh sponsored Run when idle. Supply the `SessionSender` service from `generalist/runtime` at the authenticated application boundary; it is not a field in message options. Retained child Sessions keep their current sponsor separately from their immutable family provenance. Stop, close, and explicit resume operate on Session admission policy rather than resurrecting terminal Runs; see [child admission](./child-admission.md) for allocation and cancellation semantics.

`generalist/server` exposes the same commands through `POST /sessions/:id/queue`, `PATCH /sessions/:id/queue/:inputId`, and `DELETE /sessions/:id/queue/:inputId`. The Session client offers `sessions.submit`, `sessions.updateInput`, and `sessions.removeInput`; submit takes `sessionId`, `input`, and `commandId`, while edits and removals also carry `id` and `expectedRevision`. Updates optionally carry `agent`. These routes use the existing authentication and resource-authorization boundary, not a second queue authority.

`sessions.snapshot` reads version-1 metadata, up to 32 recent Run summaries plus the canonical active Run when absent from that window, and up to 64 native active-path entries at one committed Session cursor. It preserves `selection`, `queue`, and `activeRunId`; the recent summaries do not determine which Run owns conversational control. It returns conversation continuations instead of rejecting long Sessions. Conversation entries preserve original entry IDs and parent IDs; they expose non-system user/tool/assistant messages, not instruction, memory, or skill bodies. Content larger than 8 KiB is represented by an entry with `contentDeferred: true` and no inline messages; `sessions.entry` hydrates its complete public content from the existing canonical Session entry. See the [snapshot limits](./server.md#snapshot-limits).

Runtime's `HostSessionEvent` is tagged `Run | Conversation`, with one shared cursor. Host maps the Run branch into product lifecycle events and forwards Conversation updates with their Session ID and cursor. Appends retain the update's visible prefix and replace its suffix. Branch updates carry `reset: true`, a bounded replacement page, and its older-history continuation, so clients do not append abandoned-path text. `HostEvent` therefore includes `Conversation` as well as `RunStarted`, `Turn`, `ToolCall`, `TasksUpdated`, `ArtifactUpdated`, `ApprovalRequested`, `Compacted`, and `Completed`.

Attachments delegate to an optional ambient `BlobStore`. Provide one of the Layers from `generalist/blob-store` when creating the Host to enable upload and download. Existing Hosts can still be constructed without storage; attachment calls then fail with `BlobStoreError` instead of adding a BlobStore requirement to unrelated Host operations.

The administrative `runs.list` enumeration contains root Runs only. Use `sessions.runs` for bounded display pages, including descendants; its optional `rootRunId` selects one family and is validated against the path Session. These pages bound projection work, not the size of the canonical partition materialized by the durability engine.

## Events and cursors

One durable Session cursor is assigned where Runtime appends each root-tree Run event. `subscribe(sessionId, cursor)` first resolves the Session or fails with `SessionNotFound`, then returns a stream that replays entries strictly after that exclusive cursor and follows committed live entries without a subscribe/catch-up gap. The same typed expiry and subscriber-lag failures used by Runtime-backed streams remain visible.

The Host event union intentionally projects the product events above and retains the complete Runtime event in each wrapper's `event` field. Runtime events outside that projection are filtered, so two adjacent visible Host events can have nonadjacent cursor values. Persist the last delivered cursor rather than counting Host events.

## Plugins

```ts
import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Hooks, Instructions } from "generalist"
import { Host } from "generalist/host"

const status = Tool.make("git_status", {
  description: "Read repository status",
  parameters: Schema.Struct({}),
  success: Schema.String,
})

const git = Host.plugin({
  name: "git",
  tools: [status],
  instructions: [Instructions.fromText("git", "Inspect status before changing files.")],
  hooks: [
    Hooks.onToolCall({
      key: "plugin-tool-policy",
      version: "1",
      replayPolicy: "pure",
      hook: () => Effect.succeed(Hooks.Continue()),
    }),
  ],
  skills: [],
})
```

Plugins are inert values with only `name`, `tools`, `instructions`, `skills`, and lifecycle `hooks`. Tools are installed on every configured Agent. Duplicate plugin names and static tool-name collisions fail `Host.make` before registration.

Plugins load and log sequentially in caller order. Existing ambient instructions, skills, and Hooks declarations come first, followed by plugin declarations in caller order. Existing `SkillCatalog.merge` semantics apply to duplicate skill names, so the later plugin value wins. Hook declarations use the Agent driver's existing checkpoint journal; Host does not add `onEvent` or another event authority.

## Invariants

- Host delegates Run registration, execution, inspection, cancellation, and replay to Runtime; it has no second executor or event journal.
- `HostRun.send(message, options?)` and `host.runs.send(runId, prompt, options?)` delegate to Runtime's unified durable inbox admission.
- `sessions.fork` and `runs.rewind` delegate to Runtime's atomic branch transitions. Future server routes can join at these Host methods without owning replay behavior.
- The object engine persists Session metadata, selection, pending inputs, active Run identity, root membership, conversation entries, and Session event cursors in the canonical namespace. Snapshots project that committed state; host process memory is not recovery authority.
- A Session identity is created explicitly before Host starts an Agent Run in it. Tool Runs do not require a public Session. Omitted Session IDs use Generalist's Effect-based ID generator.
- Loading a plugin performs no module-level side effects.
- Host imports only stable Generalist sources and is safe to import in Worker consumers.

## Related

- Source: `packages/generalist/src/host/index.ts`, `packages/generalist/src/host/attachments.ts`, `packages/generalist/src/runtime/session/host.ts`
- Tests: [`host/index.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/host/index.test.ts), [`host/tools.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/host/tools.test.ts)
- Sibling feature docs: [`media.md`](./media.md), [`server.md`](./server.md), [`runtime.md`](./runtime.md), [`durable-stores.md`](./durable-stores.md), [`testing.md`](./testing.md)
