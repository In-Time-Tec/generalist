# Host

`generalist/host` is the experimental in-process product boundary over the durable Runtime. A Session accepts conversational input while its current Run is busy, keeps pending input editable, and starts each accepted instruction in its own Run. Host also starts configured typed Agents directly, controls root Runs, and follows a Session-wide event stream. Runtime remains the only execution, persistence, replay, and cancellation authority.

## Usage

This composition fragment expects an object-backed Runtime activated inside its host scope; see [object durability](./durable-stores.md).

```ts
import { Effect, Layer, Schema } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent, Approvals, BlobStore, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import * as Durability from "generalist/durability"

const triage = Agent.make({
  name: "triage",
  output: Schema.String,
})

const program = Effect.gen(function* () {
  yield* Durability.activate
  const host = yield* Generalist.create({ agents: [triage] })
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

`Generalist.create({ agents, plugins? })` requires Runtime, `LanguageModel`, Approvals, Permissions, every configured Agent service, and plugin tool handlers. It registers the configured Agents with Runtime and returns no global singleton.

This fragment admits work and returns a receipt, not the Agent's answer. The declared model and Runtime Layers determine credentials and execution; no scripted or live provider is configured here. Keep the activated host scope alive while work executes.

## Surface

```text
host.attachments.put({ data, mediaType, filename? }) -> Media.Ref
host.attachments.get(sha256)                         -> { ref, data }

host.sessions.create({ id?, title?, agent? }) -> SessionHandle
host.sessions.get(sessionId)          -> SessionHandle
host.sessions.snapshot(sessionId)     -> HostSessionSnapshot
host.sessions.list()                  -> HostSession[]
host.sessions.fork(runId, { commandId, atSequence, budget?, programBudget?, substitute? }) -> HostRun<unknown>

session.inspect                      -> Effect<HostSession>
session.snapshot                     -> Effect<HostSessionSnapshot>
session.submit(input, { commandId })  -> QueueReceipt { id, revision }
session.queue.list()                 -> PendingInput[]
session.queue.update(id, input, { commandId, expectedRevision, agent? }) -> QueueReceipt
session.queue.remove(id, { commandId, expectedRevision }) -> QueueReceipt

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

host.events.subscribe(sessionId, cursor?)
  -> Effect<Stream<HostEvent>, SessionError>

host.approvals.resolve(runId, token, decision, operator) -> void

host.operator.explain(runId) -> Explanation
host.operator.retry(runId, operator, commandId) -> void
host.operator.wake(runId, operator, commandId) -> void
host.operator.resolveUnknown(runId, operationId, resolution, operator, commandId) -> void
host.operator.extendBudget(runId, delta, operator, commandId) -> void
```

`runs.start` accepts only the exact Agent values passed to `Generalist.create`; the Agent's input and output Schemas determine the input and `await` types. The returned `id` is Runtime's `runId`. Runs started with the same Session and `idempotencyKey` retain Runtime's existing idempotency behavior.

`runs.startByName` is the serialized-host boundary used by `generalist/server`. It finds one configured Agent by name and decodes the unknown input with that Agent's input Schema before starting it. Unknown names and invalid inputs remain typed Host failures. Approval and operator methods are the same Runtime operations with no second decision or recovery authority; every mutation requires the caller identity recorded by Runtime.

## Conversational queue

Create a Session with a configured Agent name before calling `submit`. Session submission and pending edits accept conversational instructions as a string or Effect AI `Prompt.Prompt`; they do not decode an Agent's typed input Schema. Use `runs.start` or `runs.startByName` for schema-defined Agent inputs. Only Agent selections are supported: Programs are rejected, and direct Tool selection is not implemented (#460).

Canonical Session metadata contains `selection`, `queue`, and an optional `activeRunId`. Each pending item retains its prompt, revision, executable reference, manifest, registrations, and selected tree policy and budget. The first input is atomically promoted into a fresh Run when the Session is idle. Later inputs remain FIFO pending items until the active Run terminalizes; terminalization and the next promotion commit together. A pending item is not a Run inbox entry and has no Run ID yet.

`create` and `get` return a `SessionHandle`. Its `inspect` and `snapshot` properties are lazy Effects: yield them to read current committed state rather than treating the handle's initial metadata as a subscription. `queue.list()` reads the current pending items; `inspect` returns the canonical metadata with its `queue` array.

Update or remove an item using its observed `expectedRevision` and a new `commandId`. An update can replace that item's Agent selection with `agent`; omitting it retains the item's pinned selection. Editing does not move the item in FIFO order or change the active Run. If an edit, removal, or promotion wins first, a stale revision fails `SessionQueueConflict`; reload the queue instead of silently retrying against a newer revision.

Every accepted queue command returns an immutable `{ id, revision }` receipt. Preserve both command identity and content across ambiguous outcomes: an exact retry returns the original receipt even after promotion, removal, or reopening. Reusing the command identity with changed content conflicts. The receipt acknowledges the command, not current membership or completion; read `inspect` or `queue.list()` for current state.

An edit's requested Agent name is part of its command identity; its registered executable is resolved only for a new admission, after receipt reconciliation. An exact retry still returns its accepted receipt if that registration later changes or disappears. New edits must pass the current Host's Agent allowlist and revision checks. HTTP authentication and resource authorization apply to every request, including retries.

The queue permits at most 64 pending entries and 1 MiB of encoded pending input, including pinned settings and registrations. A mutation exceeding a bound fails without changing the queue. These limits are independent of the exact-Run steering inbox. Canonical object state, not the Session handle or host memory, owns recovery. Use fresh namespaces; there is no compatibility reader for retired durable enqueue state.

`generalist/server` exposes the same commands through `POST /sessions/:id/queue`, `PATCH /sessions/:id/queue/:inputId`, and `DELETE /sessions/:id/queue/:inputId`. The Session client offers `sessions.submit`, `sessions.updateInput`, and `sessions.removeInput`; submit takes `sessionId`, `input`, and `commandId`, while edits and removals also carry `id` and `expectedRevision`. Updates optionally carry `agent`. These routes use the existing authentication and resource-authorization boundary, not a second queue authority.

`sessions.snapshot` reads version-1 metadata, Run projections, and a bounded active-path `conversation` at one committed Session cursor. Conversation entries preserve original entry IDs, parent IDs, and the Session leaf; they expose non-system user/tool/assistant messages, not instruction, memory, or skill bodies. Oversized projections fail rather than truncate; see the [snapshot limits](./server.md#snapshot-limits).

Runtime's `HostSessionEvent` is tagged `Run | Conversation`, with one shared cursor. Host maps the Run branch into product lifecycle events and forwards Conversation updates with their Session ID and cursor. Consumers retain the update's common visible prefix and replace its suffix, so branch changes do not append abandoned-path text. `HostEvent` therefore includes `Conversation` as well as `RunStarted`, `Turn`, `ToolCall`, `TasksUpdated`, `ArtifactUpdated`, `ApprovalRequested`, `Compacted`, and `Completed`.

Attachments delegate to an optional ambient `BlobStore`. Provide one of the Layers from `generalist/blob-store` when creating the Host to enable upload and download. Existing Hosts can still be constructed without storage; attachment calls then fail with `BlobStoreError` instead of adding a BlobStore requirement to unrelated Host operations.

Session run lists contain root Runs only. Runtime child Runs contribute events to their root Run's product Session but do not appear as separate entries in that list.

## Events and cursors

One durable Session cursor is assigned where Runtime appends each root-tree Run event. `subscribe(sessionId, cursor)` first resolves the Session or fails with `SessionNotFound`, then returns a stream that replays entries strictly after that exclusive cursor and follows committed live entries without a subscribe/catch-up gap. The same typed expiry and subscriber-lag failures used by Runtime-backed streams remain visible.

The Host event union intentionally projects the product events above and retains the complete Runtime event in each wrapper's `event` field. Runtime events outside that projection are filtered, so two adjacent visible Host events can have nonadjacent cursor values. Persist the last delivered cursor rather than counting Host events.

## Plugins

```ts
import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Hooks, Instructions } from "generalist"
import { Generalist } from "generalist/host"

const status = Tool.make("git_status", {
  description: "Read repository status",
  parameters: Schema.Struct({}),
  success: Schema.String,
})

const git = Generalist.plugin({
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

Plugins are inert values with only `name`, `tools`, `instructions`, `skills`, and lifecycle `hooks`. Tools are installed on every configured Agent. Duplicate plugin names and static tool-name collisions fail `Generalist.create` before registration.

Plugins load and log sequentially in caller order. Existing ambient instructions, skills, and Hooks declarations come first, followed by plugin declarations in caller order. Existing `SkillCatalog.merge` semantics apply to duplicate skill names, so the later plugin value wins. Hook declarations use the Agent driver's existing checkpoint journal; Host does not add `onEvent` or another event authority.

## Invariants

- Host delegates Run registration, execution, inspection, cancellation, and replay to Runtime; it has no second executor or event journal.
- `HostRun.send(message, options?)` and `host.runs.send(runId, prompt, options?)` delegate to Runtime's unified durable inbox admission.
- `sessions.fork` and `runs.rewind` delegate to Runtime's atomic branch transitions. Future server routes can join at these Host methods without owning replay behavior.
- The object engine persists Session metadata, selection, pending inputs, active Run identity, root membership, conversation entries, and Session event cursors in the canonical namespace. Snapshots project that committed state; host process memory is not recovery authority.
- A Session identity is created explicitly before Host starts a Run in it. Omitted Session IDs use Generalist's Effect-based ID generator.
- Loading a plugin performs no module-level side effects.
- Host imports only stable Generalist sources and is safe to import in Worker consumers.

## Related

- Source: `packages/generalist/src/host/index.ts`, `packages/generalist/src/host/attachments.ts`, `packages/generalist/src/runtime/session/host.ts`
- Test: [`host/index.test.ts`](https://github.com/In-Time-Tec/generalist/blob/main/packages/generalist/test/host/index.test.ts)
- Sibling feature docs: [`media.md`](./media.md), [`server.md`](./server.md), [`runtime.md`](./runtime.md), [`durable-stores.md`](./durable-stores.md), [`testing.md`](./testing.md)
