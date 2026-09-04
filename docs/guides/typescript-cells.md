---
title: "How to give an agent a TypeScript cell"
description: "Advertise the one typescript tool, compose the Bun kernel pool, mount host modules into the cell namespace, and test a host without a worker process."
---

A cell is one model-authored TypeScript source executed in the persistent kernel a Session owns. `generalist/repl` gives an agent exactly one tool for it, named `typescript`, whose parameters are exactly one bounded string field named `code`. The root export is contracts only; `generalist/repl/bun` is the only module with process dependencies.

## 1. Advertise the one tool

`CellTool.layer` provides `ToolExecutor.ToolExecutor` over `ToolContext` and `KernelPool`. Because one namespace is shared, `CellTool.scheduling` is always `{ maxConcurrency: 1, parallelSafe: [] }`: every cell is an authored-order exclusive barrier. A thrown cell is a `DomainFailure` the model reads and recovers from, not a run failure, because the tool declares `failureMode: "return"`.

This program runs the whole route against `TestKernel`, which evaluates nothing and enforces the observable contract, so it needs no worker process:

**test-kernel.ts**

```typescript
import { Console, Effect, Layer, ManagedRuntime, Option, Schema } from "effect"
import { ToolContext, ToolExecutor } from "generalist"
import { Response } from "effect/unstable/ai"
import { Cell, CellTool, KernelProfile, TestKernel } from "generalist/repl"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace", dataRoot: "/tmp/generalist" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})

const script = (request: { readonly code: string }): TestKernel.Script =>
  request.code === "boom"
    ? { _tag: "Throw", name: "TypeError", message: "boom", stderr: "boom" }
    : { _tag: "Value", value: request.code, stdout: "printed\n" }

const call = Schema.decodeSync(Response.ToolCallPart(CellTool.name, Schema.Struct({ code: Schema.String })))(
  Response.makePart("tool-call", {
    id: "call-1",
    name: CellTool.name,
    params: { code: "1 + 1" },
    providerExecuted: false,
  }),
)

const program = Effect.gen(function* () {
  const executor = yield* ToolExecutor.ToolExecutor
  const outcome = yield* executor.execute({
    call,
    toolCallBatch: { calls: [call] },
    turn: 0,
    toolCallIndex: 0,
    agentName: "assistant",
    sessionId: "session-a",
  })
  if (outcome._tag !== "Success") return yield* Console.log(`outcome: ${outcome._tag}`)
  const result = Schema.decodeUnknownOption(Cell.CellResult)(outcome.result).pipe(Option.getOrThrow)
  yield* Console.log(`value: ${result.value}`)
  yield* Console.log(`stdout: ${result.stdout.trimEnd()}`)
  yield* Console.log(`epoch: ${result.epoch}`)
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ToolContext.layerDefault, TestKernel.layerTestSandbox({ profile, script }))),
)

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
```

**Output**

```text
value: 1 + 1
stdout: printed
epoch: 0
```

## 2. Compose the Bun kernel

The real pool holds one live kernel per Session, keyed by Session identity, inside a Server-scoped reference-counted map. `workerModule` is the worker's absolute path resolved against the package's own module URL; the worker is not an importable entrypoint, so this export is the only supported way to locate it.

**Composing BunKernelPool**

```typescript
import { Duration, Effect } from "effect"
import { KernelSnapshotStore } from "generalist/repl"
import { BunKernelPool, BunKernelSnapshotStore, workerModule } from "generalist/repl/bun"

const pool = Effect.gen(function* () {
  const store = yield* BunKernelSnapshotStore.make({ dataRoot })
  return yield* BunKernelPool.make({
    profile,
    runtimeCommand: "bun",
    workerModule,
    startTimeoutMillis: 20_000,
    interruptGraceMillis: 250,
    maxConcurrentBoots: 4,
    idleTimeToLive: Duration.minutes(5),
    environment: {},
  }).pipe(Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, store))
})
```

<Warning title="idleTimeToLive must be non-zero">
The pool holds a kernel reference for exactly the duration of a cell, so a zero time to live releases the kernel the instant a cell's scope closes and every cell silently gets a fresh worker. Plain values still come back through the snapshot, so the mistake looks harmless; module bindings and live handles do not, so a module imported in one cell is undefined in the next.
</Warning>

The pool adds no poll, no keepalive, and no timer that outlives a completed cell. Idle eviction is reference-count expiry rather than a sweep, so an idle Server with a kernel attached does no kernel-attributable work.

## 3. Mount host modules into the namespace

`HostBindings.make(modules)` mounts named Schema-typed modules as kernel bindings, so a cell calls `await workspace.read({ path })` directly. Duplicate module or operation names are rejected at mount. A declared operation failure is encoded and thrown inside the cell, so the model discriminates it as data; a request for something unmounted, or one that does not satisfy the declared schema, fails typed at the boundary with its stage.

**host-bindings.ts**

```typescript
import { Console, Effect, ManagedRuntime, Option, Schema } from "effect"
import { HostBindings } from "generalist/repl"

class WorkspaceDenied extends Schema.TaggedError<WorkspaceDenied>()("generalist/docs/WorkspaceDenied", {
  path: Schema.String,
}) {}

const readFile: HostBindings.AnyOperation = {
  name: "read",
  input: Schema.Struct({ path: Schema.String }),
  output: Schema.Struct({ text: Schema.String }),
  failure: WorkspaceDenied,
  handle: (input) => {
    const { path } = Schema.decodeUnknownOption(Schema.Struct({ path: Schema.String }))(input).pipe(Option.getOrThrow)
    return path.startsWith("/etc")
      ? Effect.fail(WorkspaceDenied.make({ path }))
      : Effect.succeed({ text: `contents of ${path}` })
  },
}

const workspace: HostBindings.Module = { name: "workspace", operations: [readFile] }

const program = Effect.gen(function* () {
  const registry = yield* HostBindings.HostBindings
  const mounted = registry.descriptors.map((entry) => `${entry.module}.${entry.operations.join("/")}`)
  yield* Console.log(`mounted: ${mounted.join(" ")}`)
  const allowed = yield* registry.invoke({ module: "workspace", operation: "read", input: { path: "/w/a.ts" } })
  yield* Console.log(`allowed: ${allowed._tag}`)
  const denied = yield* registry.invoke({ module: "workspace", operation: "read", input: { path: "/etc/passwd" } })
  yield* Console.log(`denied: ${denied._tag}`)
  const missing = yield* Effect.flip(registry.invoke({ module: "web", operation: "search", input: {} }))
  yield* Console.log(`${missing._tag} module=${missing.module}`)
  const badInput = yield* Effect.flip(registry.invoke({ module: "workspace", operation: "read", input: { path: 7 } }))
  yield* Console.log(
    Schema.is(HostBindings.HostModuleSchemaFailure)(badInput)
      ? `${badInput._tag} stage=${badInput.stage}`
      : badInput._tag,
  )
})

const runtime = ManagedRuntime.make(HostBindings.layer([workspace]))
await runtime.runPromise(program)
```

**Output**

```text
mounted: workspace.read
allowed: Success
denied: Failure generalist/docs/WorkspaceDenied
generalist/repl/HostModuleNotFound module=web
generalist/repl/HostModuleSchemaFailure stage=decode-input
```

Mounted module names feed `KernelProfile.bindingsDigest`, which is part of the epoch identity, so changing the mounted surface requires a new epoch rather than reusing the old one.

## 4. Handle the four outcomes

| Failure                   | What the host does                                                                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `CellExecutionFailed`     | Nothing. The cell threw; the namespace, the kernel, and every prior binding survive, and the model reads the error |
| `KernelUnavailable`       | Nothing was evaluated; retrying the same cell is safe                                                              |
| `KernelProtocolViolation` | The kernel broke the cell protocol; restart the epoch                                                              |
| `CellOutcomeUnknown`      | The cell may or may not have committed. Resolve it explicitly; never replay it                                     |

A cell that outruns `limits.cellDeadlineMillis` is stopped by an escalation ladder: caller interruption first, then the worker's `vm` watchdog, which terminates a synchronous loop in place and leaves the namespace intact, and only then a child `SIGKILL` that starts a new epoch and reports what was lost.

## 5. Read the execution bounds honestly

- `limits.sourceBytes` refuses an oversized cell before anything is evaluated, with `KernelUnavailable { reason: "profile-mismatch" }`.
- Cell stdout, stderr, and terminal result values are returned complete.

See [the generalist/repl reference](/reference/repl) for the exact schemas and ports, and [Why the kernel is a process boundary](/learn/kernel-boundaries) for the isolation and authenticity decisions behind them.
