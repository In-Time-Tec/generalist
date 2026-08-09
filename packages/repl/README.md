# `@batonfx/repl`

One persistent TypeScript cell per Baton Session.

## Install

```sh
bun add effect @batonfx/core @batonfx/repl
```

## Imports

```ts
import { Cell, CellTool, HostBindingRegistry, KernelPool, KernelProfile, KernelStateStore } from "@batonfx/repl"
```

The root export carries contracts only: cell Schemas, the `KernelProfile`, the kernel ports, the one
Effect AI tool, and in-memory test layers. It has no process dependencies, so projection consumers,
decoders, and test hosts import it without any worker code. `@batonfx/repl/bun` carries the Bun
kernel and is the only module that touches the process.

## The one tool

```ts
typescript({ code: string }) // <= 64 KiB
```

Success is `Cell.CellResult`; failure is the closed `Cell.CellFailure` union of
`CellExecutionFailed`, `KernelUnavailable`, `KernelProtocolViolation`, and `CellOutcomeUnknown`. A
thrown cell is a domain failure the model reads and recovers from, not a run failure. One shared
namespace means `CellTool.scheduling` is always exclusive and authored-order.

## Layer graph

```text
KernelPool           (a kernel per Session: execute, inspect, interrupt, restart, close)
KernelStateStore     (best-effort snapshot + honest saved/dropped manifest)
HostBindingRegistry  (named Schema-typed host modules mounted into the namespace)
└─ CellTool.layer
   └─ provides ToolExecutor.ToolExecutor over ToolContext
```

## Runnable program

```ts
import { Effect, Layer } from "effect"
import { ToolContext } from "@batonfx/core"
import { CellTool, KernelProfile, TestKernel } from "@batonfx/repl"

const profile = KernelProfile.make({
  runtime: { name: "bun", version: "1.3.14", digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: process.cwd(), dataRoot: "/tmp/baton" },
  limits: { sourceBytes: CellTool.maxSourceBytes, channelBytes: 262_144, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
})

const layer = CellTool.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ToolContext.layerDefault, TestKernel.layerTestPool({ profile }))),
)
```

`TestKernel.layerTestPool` evaluates nothing: it enforces the observable kernel contract — cell-local
monotonic sequences, epochs across restart, closed sessions — so a host is tested without a worker.

## Why the Bun kernel is a child process, not a `Worker`

`@batonfx/repl/bun` spawns each kernel as a **child process** speaking JSONL over stdio. An earlier
revision used `@effect/platform-bun`'s thread-backed `BunWorker`. It was replaced because a worker
thread cannot be killed safely while it is spinning, and killing a wedged kernel is a required
operation: a synchronous busy loop that escapes the `vm` watchdog is exactly the case the last tier
of the escalation ladder exists for.

Reproduction, on Bun 1.3.14: run `while (true) {}` inside a `BunWorker` and call `terminate()`. The
**host process** dies with `SIGTRAP`, exit code 133 — five runs out of five. The kernel is supposed
to be a lifecycle boundary; a kernel that takes the Server down with it is not one.

The same case over a child process is safe: `SIGKILL` on a spinning child leaves the host alive, and
the pool starts a new epoch and reports what the namespace lost. The escalation ladder is therefore
`AbortSignal` (async work) → `vm` `timeout`/`breakOnSigint` (synchronous loops, terminated in place
with the namespace intact) → child `SIGKILL` + new epoch + best-effort restore. Only the last tier
loses state, and it says so.

Do not reintroduce a thread-based transport. Process isolation is what makes the kill tier survivable.

## One raw adapter, on purpose

`src/repl/bun-worker.ts` is the only module in this package that is not Effect-native, and
`.oxlintrc.json` exempts that one file from `effecttsgo/async-function` and `effecttsgo/new-promise`.
It is not a Baton module that happens to use Promises: it is the standalone program the kernel spawns
(`bun bun-worker.js <workspaceRoot>`), running inside the child with no Effect runtime of its own.

Its Promise machinery is load-bearing. The read loop must never block behind an executing cell, or a
host reply cannot settle a promise that the running cell is awaiting — cells would deadlock the
moment one called a mounted host module. That is why frames are read continuously while cells run on
a separate promise chain. Rewriting it in `Effect.gen` would reintroduce exactly the deadlock the
design exists to prevent.

The exemption is scoped to that single path, not a glob. Everything above it — the pool, the session
transport, the frame folding, the snapshot store — is ordinary Effect with typed errors and scopes.
Treat the file as the named process boundary, not as precedent for new Promise-first code.

## Composing the Bun kernel

```ts
import { Duration, Effect } from "effect"
import { KernelStateStore } from "@batonfx/repl"
import { BunKernelPool, BunKernelStateStore, workerModule } from "@batonfx/repl/bun"

const store = yield * BunKernelStateStore.make({ dataRoot })
const pool =
  yield *
  BunKernelPool.make({
    profile,
    runtimeCommand: "bun",
    workerModule,
    startTimeoutMillis: 20_000,
    interruptGraceMillis: 250,
    maxConcurrentBoots: 4,
    idleTimeToLive: Duration.minutes(5),
    environment: {},
  }).pipe(Effect.provideService(KernelStateStore, store))
```

`workerModule` is the worker's absolute path, resolved against the package's own module URL rather
than the caller's working directory. The worker is not an importable entrypoint, so this export is
the only supported way to locate it; its layout stays an implementation detail of this package.

`idleTimeToLive` must be non-zero. The pool holds a kernel reference for exactly the duration of a
cell, so a zero time to live releases the kernel the instant a cell's scope closes and every cell
silently gets a fresh worker. Plain values still come back through the snapshot, so the mistake looks
harmless; module bindings and live handles do not, so `const E = await import("effect")` in one cell
leaves `typeof E` undefined in the next.

## Idle cost

A pool with live kernels does no work between cells. There is no poll, no keepalive, and no timer
that outlives a completed cell: a kernel's reference is held for the duration of one cell, and idle
eviction is reference-count expiry rather than a sweep. An idle Server with a kernel attached should
show no kernel-attributable CPU.

## The frame channel

Frames do not travel on stdout. The worker writes them to file descriptor 3 and reads commands from
file descriptor 4, and stdout, stderr, and stdin belong entirely to cell code. Nothing a cell writes
to its own output — directly, from a native addon, or from a subprocess that inherited the
descriptor — is ever read as a frame, and nothing a cell reads can consume a command.

The descriptor is the channel, not the authority. Cell code runs inside the worker's process, so it
can name descriptor 3 and write to it; every frame therefore also carries a boot-time secret sent
once over descriptor 4 and held in the worker's module scope, which the evaluation context cannot
reach. A line without the secret is not a frame, whoever wrote it. The secret is never placed in
`argv` or the environment, both of which cell code can read and the process table exposes.

Without both halves a cell can speak for the kernel: attribute output to another cell, answer the
host's own control request, or — the sharpest case — fabricate its own terminal result and replace
the outcome every downstream certainty guarantee is built on. Each of those is a test in
`bun-frame-integrity.test.ts`.

## Output bounds

The host meters output, not the worker. A cell's bytes arrive by several routes — the kernel's own
`console`, a direct write to the process's stdout, a subprocess that inherited the descriptor — and
only the host sees all of them, so `limits.channelBytes` is enforced where they converge. Metering
inside the worker would bound `console` alone and let `Bun.spawnSync(..., { stdout: "inherit" })`
past the bound entirely, which is the plan's own happy path for running project commands.

Truncation is reported rather than silent: each channel accounts for the bytes and events it dropped,
and the cell's result carries that account.

## SIGINT

The worker installs a no-op `SIGINT` handler. That is deliberate: it is what makes the second tier of
the escalation ladder survivable, because `breakOnSigint` terminates the running script while the
context, its variables, and the worker itself live on. The consequence is that `SIGINT` cannot
terminate an idle worker and a stray operator `SIGINT` is swallowed; the kill tier uses `SIGKILL`.

## Testing against a real worker

Real-worker suites must opt out of the test services:

```ts
layer(platform, { excludeTestServices: true })("...", (it) => {
  /* ... */
})
```

The interrupt ladder and the deadline escalation are built from `Effect.sleep`. Under the default
test clock those sleeps never elapse, so a kernel that is merely waiting is indistinguishable from a
kernel that has hung, and an interrupt test will sit until the runner's ceiling.

## Errors, requirements, and resources

Every boundary failure is a `Schema.TaggedErrorClass` tagged `@batonfx/repl/*`. The `KernelProfile`
declares no secret-bearing field — only identifiers, digests, paths, and bounds — and unknown keys
are dropped from both its encoded form and its digest. The content of its free-text identifier and
path fields is host-supplied and is not scanned, so a host that embeds a secret in a path persists
and renders it. Kernel variables are working memory: Baton operations, events, Session entries, and
children remain the only durable authority, and an uncertain cell is never replayed.
