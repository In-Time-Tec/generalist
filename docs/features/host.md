# Host

`generalist/host` is the stable in-process product boundary over the durable Runtime. It creates product-facing Sessions, starts configured typed Agents, lists and controls their root Runs, and follows a Session-wide event stream. Runtime remains the only execution, persistence, replay, and cancellation authority.

## Usage

```ts
import { Effect, Layer, Schema } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"

const triage = Agent.make({
  name: "triage",
  input: Schema.Struct({ ticket: Schema.String }),
  output: Schema.String,
})

const program = Effect.gen(function* () {
  const host = yield* Generalist.create({ agents: [triage] })
  const session = yield* host.sessions.create({ title: "Support inbox" })
  const run = yield* host.runs.start(session.id, triage, { ticket: "Cannot sign in" })

  const events = yield* host.events.subscribe(session.id)
  const answer = yield* run.await
  return { session, runId: run.id, events, answer }
})

const runtime = Runtime.layerMemory({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
declare const model: Layer.Layer<LanguageModel.LanguageModel>

Effect.runPromise(
  program.pipe(Effect.provide(Layer.mergeAll(runtime, model, Permissions.layerAllowAll, Approvals.layerAutoApprove))),
)
```

`Generalist.create({ agents, plugins? })` requires Runtime, `LanguageModel`, Approvals, Permissions, every configured Agent service, and plugin tool handlers. It registers the configured Agents with Runtime and returns no global singleton.

## Surface

```text
host.sessions.create({ id?, title? }) -> HostSession
host.sessions.get(sessionId)          -> HostSession
host.sessions.list()                  -> HostSession[]
host.sessions.fork(runId, { atSequence, substitute? }) -> HostRun<unknown>

host.runs.start(sessionId, agent, typedInput, { idempotencyKey? })
  -> { id, await, events, send }
host.runs.startByName(sessionId, agentName, untrustedInput, { idempotencyKey? })
  -> { id, await, events, send }
host.runs.list(sessionId)             -> root Run inspections
host.runs.inspect(runId)              -> Run inspection
host.runs.send(runId, prompt, { policy?, from?, idempotencyKey? })
                                      -> { entryId, sequence }
host.runs.cancel(runId, reason?)       -> void
host.runs.rewind(runId, { toSequence }) -> void

host.events.subscribe(sessionId, cursor?)
  -> Effect<Stream<RunStarted | Turn | ToolCall | ApprovalRequested | Compacted | Completed>, SessionError>

host.approvals.resolve(runId, token, decision, operator) -> void

host.operator.explain(runId) -> Explanation
host.operator.retry(runId, operator) -> void
host.operator.wake(runId, operator) -> void
host.operator.resolveUnknown(runId, operationId, resolution, operator) -> void
host.operator.extendBudget(runId, delta, operator) -> void
```

`runs.start` accepts only the exact Agent values passed to `Generalist.create`; the Agent's input and output Schemas determine the input and `await` types. The returned `id` is Runtime's `runId`. Runs started with the same Session and `idempotencyKey` retain Runtime's existing idempotency behavior.

`runs.startByName` is the serialized-host boundary used by `generalist/server`. It finds one configured Agent by name and decodes the unknown input with that Agent's input Schema before starting it. Unknown names and invalid inputs remain typed Host failures. Approval and operator methods are the same Runtime operations with no second decision or recovery authority; every mutation requires the caller identity recorded by Runtime.

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
  hooks: [Hooks.onToolCall(() => Effect.succeed(Hooks.Continue()))],
  skills: [],
})
```

Plugins are inert values with only `name`, `tools`, `instructions`, `skills`, and lifecycle `hooks`. Tools are installed on every configured Agent. Duplicate plugin names and static tool-name collisions fail `Generalist.create` before registration.

Plugins load and log sequentially in caller order. Existing ambient instructions, skills, and Hooks declarations come first, followed by plugin declarations in caller order. Existing `SkillCatalog.merge` semantics apply to duplicate skill names, so the later plugin value wins. Hook declarations use the Agent driver's existing checkpoint journal; Host does not add `onEvent` or another event authority.

## Invariants

- Host delegates Run registration, execution, inspection, cancellation, and replay to Runtime; it has no second executor or event journal.
- `HostRun.send(message, options?)` and `host.runs.send(runId, prompt, options?)` delegate to Runtime's unified durable inbox admission.
- `sessions.fork` and `runs.rewind` delegate to Runtime's atomic branch transitions. Future server routes can join at these Host methods without owning replay behavior.
- Memory Sessions live for the Layer lifetime. SQLite, PostgreSQL, and MySQL persist Session metadata, root membership, and Session event cursors in the shared Runtime schema.
- A Session identity is created explicitly before Host starts a Run in it. Omitted Session IDs use Generalist's Effect-based ID generator.
- Loading a plugin performs no module-level side effects.
- Host imports only stable Generalist sources and is safe to import in Worker consumers.

## Related

- Source: `packages/generalist/src/host/index.ts`, `packages/generalist/src/runtime/session/host.ts`
- Sibling feature docs: [`server.md`](./server.md), [`runtime.md`](./runtime.md), [`durable-stores.md`](./durable-stores.md), [`testing.md`](./testing.md)
