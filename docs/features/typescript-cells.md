# TypeScript cells

A Session owns one persistent, ordered TypeScript namespace behind the single `typescript` tool. `generalist/repl` defines the contract; `generalist/repl/bun` runs it in a trusted-local Bun child process.

## Usage

```ts
import { Duration, Layer } from "effect"
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { CellTool, KernelProfile } from "generalist/repl"
import { BunKernelPool, BunKernelSnapshotStore, workerModule } from "generalist/repl/bun"

const profile = KernelProfile.make({
  provider: "bun-local",
  runtime: { name: "bun", version: "1.2.20", digest: "bun-1.2.20" },
  image: { kind: "runtime", reference: "bun@1.2.20", digest: "bun-1.2.20" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
  bindingsDigest: KernelProfile.bindingsDigest([]),
  workspace: { root: "/workspace/agent", dataRoot: "/workspace/data" },
  limits: { sourceBytes: CellTool.maxSourceBytes, cellDeadlineMillis: 120_000 },
})
// prettier-ignore
const pool = BunKernelPool.layer({ profile, runtimeCommand: "bun", workerModule,
  startTimeoutMillis: 20_000, interruptGraceMillis: 250, maxConcurrentBoots: 4,
  idleTimeToLive: Duration.minutes(5), environment: {} }).pipe(
  Layer.provide(BunKernelSnapshotStore.layer({ dataRoot: "/workspace/data" })), Layer.provide(bunServices))
export const cells = CellTool.layer.pipe(Layer.provide(pool))
// The model calls: typescript({ code: "const total = 20 + 22; total" })
```

## What runs

```text
Agent tool call
└── typescript({ code: "const total = 20 + 22; total" })
    └── CellTool.route
        ├── decode bounded { code: string }
        └── KernelPool.execute(sessionId, cellId, code)
            ├── admit one cell for this Session
            ├── acquire/reuse Bun child kernel
            ├── emit KernelReady(sequence: 0, epoch: 0)
            ├── worker evaluates source in persistent namespace
            │   └── emit Result(sequence: 1, value: "42")
            ├── emit one ToolContext progress per CellEvent
            └── return CellResult { value: "42", epoch: 0, ... }
```

```text
RI  Parameters { code: "const total = 20 + 22; total" }
    │ CellTool.route -> KernelPool.execute
    ▼
    CellEvent stream: KernelReady(0), Result(1, "42")
    │ ToolContext.emit + await execution.result
    ▼
RO  CellResult { value: "42", stdout: "", stderr: "", epoch: 0 }
```

`KernelPool` has five Session-keyed operations: `execute`, `inspect`, `interrupt`, `restart`, and `close`. Provider creation, pause, resume, networking, and billing remain inside explicit host-provided Layers.

## Recovery state

```text
live-process  same paused process and namespace continued
filesystem    only the provider filesystem checkpoint continued
namespace     Generalist restored best-effort bindings
restart-only  no prior kernel state continued
```

`Inspection.recovery` and `Restart.recovery` report the recovery that happened, not a profile capability. Bun retains its trusted-local child-process boundary, persistent workspace, and best-effort namespace snapshots; it does not acquire hosted networking or billing behavior.

## Failure paths

```text
typescript({ code: "throw new Error('bad row')" })
└── Bun worker throws; prior namespace survives
    └── CellExecutionFailed
        └── DomainFailure (`failureMode: "return"`)
            └── model receives the error as its next observation
```

- `CellExecutionFailed`: source threw; the kernel and prior bindings survive.
- `KernelUnavailable`: no source ran, so retry is safe.
- `KernelProtocolViolation`: the kernel violated framing or event order; replace the epoch.
- `CellOutcomeUnknown`: source may have committed; resolve explicitly and never replay it automatically.

## Invariants

- An agent advertises exactly one REPL tool, named `typescript`, with exactly one bounded string parameter, `code`.
- `CellTool.scheduling` is `{ maxConcurrency: 1, parallelSafe: [] }`; each cell is an authored-order exclusive barrier.
- A successful `CellResult` contains the complete formatted value, stdout, stderr, duration, cell identity, final sequence, and kernel epoch.
- `CellFailure` is closed over `CellExecutionFailed`, `KernelUnavailable`, `KernelProtocolViolation`, and `CellOutcomeUnknown`; the tool uses `failureMode: "return"`.
- `CellEvent` is closed over `KernelStarting`, `KernelReady`, `Stdout`, `Stderr`, `HostCall`, `Result`, `Display`, `StateRestored`, `StateLost`, and `KernelRestarted`.
- Every event carries one `cellId`; its cell-local sequence starts at 0 and increments by one. Gaps, repeats, non-zero starts, and second-cell interleaving are protocol violations.
- The route emits one existing `ToolContext` progress update per event; oversized or unencodable event bodies retain their event identity and sequence.
- One Session has at most one live or paused resource and one admitted cell; different Sessions may execute concurrently.
- `KernelProfile` pins contract and protocol versions, provider, exact runtime/image/template identity, isolation, checkpoint capabilities, bindings digest, workspace paths, and source/execution limits.
- A profile contains no credential, mutable resource ID, owner, or generation. Unknown keys are dropped from encoding and digest; host-supplied identifiers and paths are not secret-scanned.
- A foreign protocol version fails decoding. `KernelProfile.digest` is content-addressed epoch identity; any profile change requires a replacement epoch.
- `KernelProfile.bindingsDigest` sorts module names, so mount order is irrelevant but adding or removing a module changes the epoch identity.
- `KernelSnapshotStore` is best-effort namespace storage; its manifest names every value/source/import restoration and every dropped binding with its reason.
- `HostBindings` mounts named Schema-typed modules. Duplicate modules or operations are rejected, declared host failures become tagged cell data, and schema faults identify their boundary stage.
- `KernelResourceAuthority` is host-owned external-resource fencing, separate from Runtime Run fencing and `KernelSnapshotStore`.
- The authority atomically binds Session, owner, monotonically increasing generation, profile, resource, epoch, lease, and sole admitted cell; mutable IDs and cleanup diagnostics stay host-only.
- Every remote command and response carries its exact claim. The provider-side boundary calls `admit` immediately before acting; a host-side lease check alone is insufficient.
- After lease expiry, a new owner gets a greater generation and honestly reconnects the exact resource or replaces it; every stale-owner operation is rejected.
- Loss before admission proves source did not run. Loss after admission without a matching terminal response is `CellOutcomeUnknown`.
- Idle pause is allowed only without an admitted cell. `close` deletes live and paused hosted resources; failed deletion remains visible and retryable until absence is proven.
- Kernel state is working memory, never authority. Operations, events, Session entries, and children are truth; restart reports exactly restored and dropped names.
- Bun's filesystem is persistent and its namespace restoration is best-effort; live handles and unsupported bindings can be dropped.
- `TestKernel` provides in-memory pool, snapshot-store, and resource-authority implementations.
- `KernelProviderConformance.kernelProviderConformance` checks shared lifecycle behavior and deterministic remote two-host, generation, reconnect, uncertainty, pause, and cleanup behavior.
- Deterministic conformance cannot prove vendor microVM isolation or billing cleanup; hosted adapters still require live provider gates.
- `CodeExecutor` is a separate boundary: each Agent Program is a fresh stateless evaluation and never owns the Session's ordered REPL namespace.

## Related

- Source: `packages/generalist/src/repl/...`
- Site: `/docs/guides/typescript-cells`, `/docs/reference/repl`, `/docs/learn/kernel-boundaries`
- Decisions/tradeoffs: `../decisions/kernel-child-process.md`, `../decisions/kernel-frame-channel.md`, `../decisions/kernel-profile-pin.md`, `../decisions/kernel-state-is-not-authority.md`, `../decisions/e2b-kernel-pool-rejected.md`
