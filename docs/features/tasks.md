# Tasks

`Tasks` gives an Agent a small model-owned task list backed by its existing Run journal. The list is model context, durable recovery state, and a host-facing event source; it is not a separate store.

## Usage

```ts
import { Effect, Layer } from "effect"
import { Agent, Approvals, Permissions, Tasks } from "generalist"
import { Runtime } from "generalist/runtime"

const assistant = Agent.make({ name: "assistant" })
const environment = Layer.mergeAll(Tasks.layer(), Permissions.layerAllowAll, Approvals.layerAutoApprove)

const run = Agent.run(assistant, "Plan and complete the migration").pipe(Effect.provide(environment))

const hosted = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  yield* runtime.register(assistant)
  const handle = yield* runtime.start(assistant, "Plan and complete the migration")

  yield* runtime.send(handle.runId, Tasks.update([{ id: "tests", status: "done" }]), {
    policy: "steer",
  })
}).pipe(Effect.provide(environment))
```

`Tasks.layer()` adds two tools to every Agent run or Runtime registration in its environment:

- `tasks_read({})` returns the current list, initially `[]`.
- `tasks_write({ items })` replaces the complete list. The model must include every item that should remain.

Each item is a `Tasks.Item` Schema value with `id`, `title`, `status: "todo" | "doing" | "done"`, and an optional `note`. `Tasks.update` accepts partial edits keyed by `id`; `note: null` asks the model to remove the note. It returns a `Prompt.Prompt`, so the ordinary `Runtime.send` admission policies and steering queue remain authoritative.

## Host events

A successful write projects as the public Host event:

```ts
{
  _tag: "TasksUpdated",
  sessionId,
  cursor,
  runId,
  items,
}
```

The Host still emits `ToolCall` when `tasks_write` starts. Its successful completion projects as `TasksUpdated` at that event's one durable Session cursor, rather than producing two Host events with the same cursor.

## Persistence and replay

`tasks_write` is an ordinary journaled tool operation. Its successful result updates `LoopDriverState.tasks` in the same checkpoint transition as the tool result. Recovery returns the recorded operation result and reapplies that transition without invoking the handler. Fork and rewind therefore carry the task list through the checkpoint they already copy; there is no task table or secondary event journal.

Before every model call, the current list is rendered as one canonical system message in Chat history. Compaction normalizes every custom result so that exact message remains in the retained `history` prefix. Session persistence continues to store conversation only; after a Session projection rebuild, the task message is reconstructed from the driver checkpoint.

## Child inheritance

Task inheritance is explicit per child profile:

```ts
AgentTool.fanOut({
  name: "delegate",
  description: "Delegate work",
  agents: {
    worker: { agent: worker, inherit: { tasks: "read" } },
  },
  maxChildren: 4,
})
```

`tasks: "read"` captures the parent's current list when the child is admitted and adds that immutable snapshot to the child's instructions. The child cannot mutate the parent. Its own task tools, when present, write only its own Run checkpoint. The default is `tasks: "none"`.

## Invariants

- The driver checkpoint is the only task-list authority.
- A successful `tasks_write` replaces the complete list and emits one `TasksUpdated` Host event.
- Completed-operation replay restores the list without tool dispatch.
- The canonical current-list message always remains in compaction history verbatim.
- Parent task inheritance is a read-only admission-time snapshot; child writes never cross Run boundaries.

## Related

- Source: `packages/generalist/src/tasks/`, `packages/generalist/src/core/agent/tools/checkpoint-operation.ts`, `packages/generalist/src/host/event.ts`
- Sibling feature docs: [`steering.md`](./steering.md), [`session-and-compaction.md`](./session-and-compaction.md), [`multi-agent.md`](./multi-agent.md), [`host.md`](./host.md)
