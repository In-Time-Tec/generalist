---
title: "Tutorial: an agent that writes TypeScript"
description: "Give an agent one persistent TypeScript cell, watch its lifecycle events, mount a host module into its namespace, and swap the test kernel for the real Bun kernel."
---

In this tutorial we give an agent one persistent TypeScript cell, run cells against a kernel that evaluates nothing, then swap in the real Bun kernel. No API keys, no worker process until the last step.

You will learn how to:

- Pin one kernel epoch with a KernelProfile
- Run a cell and read its lifecycle events
- Mount a host module into the cell namespace
- Compose the real Bun kernel pool

## Step 1: Create the project

**Terminal**

```bash
mkdir cell-agent && cd cell-agent
bun init -y
bun add effect@4.0.0-rc.112 generalist@0.61.1 @effect/platform-bun@4.0.0-rc.112
```

`generalist/repl`'s root export is contracts only, so nothing so far touches a process.

## Step 2: Pin an epoch

A `KernelProfile` is everything one kernel epoch is reconstructed from. Put this in `index.ts` and run `bun run index.ts`:

**index.ts**

```typescript
import { Console, Effect } from "effect"
import { CellTool, KernelProfile } from "generalist/repl"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

const program = Effect.gen(function* () {
  yield* Console.log(`tool: ${CellTool.tool.name}`)
  yield* Console.log(`parameters: ${Object.keys(CellTool.Parameters.fields).join(", ")}`)
  yield* Console.log(
    `scheduling: maxConcurrency=${CellTool.scheduling.maxConcurrency} parallelSafe=${CellTool.scheduling.parallelSafe.length}`,
  )
  yield* Console.log(`epoch digest: ${KernelProfile.digest(profile)}`)
})

await Effect.runPromise(program)
```

**Output**

```text
tool: typescript
parameters: code
scheduling: maxConcurrency=1 parallelSafe=0
epoch digest: 12f2803b14c8b96bc3580bb6fdc07ca792eab971f31260feb0922f030c588991
```

Three facts are already visible. The agent gets exactly one tool, named `typescript`, with exactly one parameter, `code`. Because one namespace is shared, scheduling is always `maxConcurrency: 1` with no parallel-safe tool, so every cell is an authored-order exclusive barrier. And the profile has a digest: change the pinned runtime, the mounted bindings, the workspace, the limits, or the trust mode, and you get a different epoch rather than a reused one.

## Step 3: Run a cell and read its events

`TestKernel.layerTestPool` provides a `KernelPool` that evaluates nothing. It still enforces the observable contract, which is exactly what we want to see first. Replace `index.ts` and run it again:

**index.ts**

```typescript
import { Console, Effect, ManagedRuntime, Stream } from "effect"
import { KernelPool, KernelProfile, CellTool, TestKernel } from "generalist/repl"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

const script = (request: { readonly code: string }): TestKernel.Script =>
  request.code === "boom"
    ? { _tag: "Throw", name: "TypeError", message: "boom", stderr: "boom\n" }
    : { _tag: "Value", value: request.code, stdout: "printed\n" }

const runCell = (cellId: string, code: string) =>
  Effect.gen(function* () {
    const pool = yield* KernelPool.KernelPool
    const execution = yield* pool.execute({ sessionId: "session-a", cellId, code })
    const events = yield* Stream.runCollect(execution.events)
    yield* Console.log(`${cellId} events: ${events.map((event) => `${event.sequence}:${event._tag}`).join(" ")}`)
    return yield* Effect.exit(execution.result)
  })

const program = Effect.gen(function* () {
  const ok = yield* runCell("c1", "1 + 1")
  yield* Console.log(`c1 outcome: ${ok._tag}`)
  const threw = yield* runCell("c2", "boom")
  yield* Console.log(`c2 outcome: ${threw._tag}`)
})

const runtime = ManagedRuntime.make(TestKernel.layerTestPool({ profile, script }))
await runtime.runPromise(Effect.scoped(program))
await runtime.dispose()
```

**Output**

```text
c1 events: 0:KernelReady 1:Stdout 2:Result
c1 outcome: Success
c2 events: 0:KernelReady 1:Stderr
c2 outcome: Failure
```

Every event carries its `cellId` and a cell-local `sequence` that starts at 0 and increases by exactly one — `Cell.validateSequence` rejects a gap, a repeat, a non-zero start, and interleaving from a second cell. The second cell threw, and its outcome is a `Failure`, but read what that means: `CellExecutionFailed` is model input, not a run failure. The namespace, the kernel, and every prior binding survive it.

<Note title="Four outcomes, not two">
CellExecutionFailed means the cell threw and everything survived. KernelUnavailable means nothing was evaluated. KernelProtocolViolation means the kernel broke the cell protocol. CellOutcomeUnknown means the cell may or may not have committed — a host resolves that one explicitly and never replays it.
</Note>

## Step 4: Mount a host module

A cell that can only compute is not very useful. `HostBindings` mounts named Schema-typed modules as kernel bindings, so a cell writes `await workspace.read({ path })` directly. Add the module and run the whole tool route:

**index.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Option, Schema } from "effect"
import { ToolContext, ToolExecutor } from "generalist"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, HostBindings, KernelProfile, TestKernel } from "generalist/repl"

class NotFound extends Schema.TaggedError<NotFound>()("generalist/tutorial/NotFound", {
  path: Schema.String,
}) {}

const workspace: HostBindings.Module = {
  name: "workspace",
  operations: [
    {
      name: "read",
      input: Schema.Struct({ path: Schema.String }),
      output: Schema.Struct({ text: Schema.String }),
      failure: NotFound,
      handle: (input) => {
        const { path } = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.String }))(input).pipe(
          Option.getOrThrow,
        )
        return path === "/README.md" ? Effect.succeed({ text: "# cell-agent" }) : Effect.fail(NotFound.make({ path }))
      },
    },
  ],
}

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace/cell-agent", dataRoot: "/tmp/cell-agent" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

/**
 * TestKernel evaluates nothing: it enforces the observable contract and returns what this script
 * says. The script therefore stands in for what the real Bun kernel would compute for this cell.
 */
const script = (): TestKernel.Script => ({ _tag: "Value", value: '"# cell-agent"' })

const call = Schema.decodeSync(Response.ToolCallPart(CellTool.name, Schema.Struct({ code: Schema.String })))(
  Response.makePart("tool-call", {
    id: "call-1",
    name: CellTool.name,
    params: { code: 'const file = await workspace.read({ path: "/README.md" }); file.text' },
    providerExecuted: false,
  }),
)

const program = Effect.gen(function* () {
  const registry = yield* HostBindings.HostBindings
  const mounted = registry.descriptors.map((entry) => `${entry.module}.${entry.operations.join("/")}`)
  yield* Console.log(`mounted: ${mounted.join(" ")}`)
  yield* Console.log(`bindings digest: ${profile.bindingsDigest}`)

  const executor = yield* ToolExecutor.ToolExecutor
  const outcome = yield* executor.execute({
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "assistant",
    sessionId: "session-a",
  })
  yield* Console.log(`outcome: ${outcome._tag}`)
  if (outcome._tag === "Success") {
    const result = Schema.decodeUnknownOption(Cell.CellResult)(outcome.result).pipe(Option.getOrThrow)
    yield* Console.log(`value: ${result.value}`)
  }
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      ToolContext.layerDefault,
      HostBindings.layer([workspace]),
      TestKernel.layerTestSandbox({ profile, script }),
    ),
  ),
)

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
await runtime.dispose()
```

**Output**

```text
mounted: workspace.read
bindings digest: 54d2f7dd1bee8efcf49681349de679f40745c8dd5681d57414c5bcb75d499ba5
outcome: Success
value: "# cell-agent"
```

The mounted module names feed `KernelProfile.bindingsDigest`, which is part of the epoch identity — so widening what a cell can reach means a new epoch, not a quietly different one. A declared operation failure is encoded and thrown inside the cell, so the model discriminates it as data; an unmounted module, or input that does not satisfy the declared schema, fails typed at the boundary with its stage.

## Step 5: Swap in the real Bun kernel

Everything so far ran without a worker process. `generalist/repl/bun` changes that. The following is a composition fragment, not a standalone runnable file: supply the `workspace` module from Step 4, a writable `dataRoot`, and your installed `bunVersion`. The earlier `1.3.14` profile values are test fixtures, not the required Bun version. Use the repository's pinned Bun version for the real kernel.

**kernel.ts**

```typescript
import { Duration, Layer } from "effect"
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { ToolContext, ToolExecutor } from "generalist"
import { CellTool, HostBindings, KernelProfile } from "generalist/repl"
import { BunKernelPool, BunKernelSnapshotStore, workerModule } from "generalist/repl/bun"
import { layerBunKernel } from "generalist/sandbox"

declare const workspace: HostBindings.Module
declare const dataRoot: string
declare const bunVersion: string

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: bunVersion, digest: "runtime-digest" },
  image: { kind: "runtime", reference: `bun@${bunVersion}`, digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace/cell-agent", dataRoot },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

const snapshotStore = BunKernelSnapshotStore.layer({ dataRoot })

const kernelPool = BunKernelPool.layer({
  profile,
  runtimeCommand: "bun",
  // Resolved against the package's own module URL. The worker is not an importable entrypoint.
  workerModule,
  startTimeoutMillis: 20_000,
  interruptGraceMillis: 250,
  maxConcurrentBoots: 4,
  // Must be non-zero: the pool holds a kernel reference for exactly the duration of one cell, so a
  // zero time to live gives every cell a fresh worker and silently loses module bindings.
  idleTimeToLive: Duration.minutes(5),
  environment: {},
}).pipe(Layer.provide(snapshotStore), Layer.provide(bunServices))

const sandbox = layerBunKernel({ image: profile.image.reference, workspaceRoot: profile.workspace.root }).pipe(
  Layer.provide(kernelPool),
  Layer.provide(snapshotStore),
  Layer.provide(bunServices),
)

export const cellLayer: Layer.Layer<
  ToolExecutor.ToolExecutor | ToolContext.ToolContext,
  HostBindings.HostModuleConflict
> = CellTool.layer.pipe(
  Layer.provide(sandbox),
  Layer.provide(HostBindings.layer([workspace])),
  Layer.provideMerge(ToolContext.layerDefault),
)
```

Now cells really evaluate: declarations, imports, and values persist across cells in one Session, top-level await works, and each Session gets its own kernel process. Two options deserve attention.

- `workerModule` is the worker's absolute path resolved against the package's own module URL. The worker is not an importable entrypoint, so this is the only supported way to locate it.
- `idleTimeToLive` must be non-zero. The pool holds a kernel reference for exactly the duration of a cell, so a zero time to live releases it the instant the cell's scope closes. Plain values still come back through the snapshot, so the mistake looks harmless — but module bindings and live handles do not, so an imported module from one cell is undefined in the next.

## What you built

One agent with one persistent TypeScript namespace, bounded output, a typed failure taxonomy the model can recover from, and a host surface the cell can call. The kernel is a lifecycle boundary rather than a sandbox: a cell runs with the host user's OS permissions, its namespace is working memory rather than durable authority, and an uncertain cell is never replayed.

Next: [How to give an agent a TypeScript cell](/guides/typescript-cells) for the task-shaped version of these steps, [Why the kernel is a process boundary](/learn/kernel-boundaries) for the isolation and authenticity decisions, and [the generalist/repl reference](/reference/repl) for the exact schemas and ports.
