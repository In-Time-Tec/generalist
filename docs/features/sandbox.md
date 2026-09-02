# Sandboxes

`generalist/sandbox` is the provider-neutral code execution seam. A host supplies a `SandboxProvider`; callers acquire one scoped `Sandbox` and use only the command, lifecycle, filesystem, limit, and snapshot capabilities that leaf declares.

## Contract

```ts
import { Duration, Effect } from "effect"
import * as Sandbox from "generalist/sandbox"

const program = Effect.scoped(
  Effect.gen(function* () {
    const provider = yield* Sandbox.SandboxProvider
    const sandbox = yield* provider.acquire({
      image: provider.defaultImage,
      key: "session-42",
      limits: { wallClock: Duration.seconds(30) },
    })

    const result = yield* sandbox.exec({
      _tag: "TypeScript",
      cellId: "cell-1",
      source: "const answer = 42; answer",
    })
    return result.value
  }),
)
```

`acquire` requires `Scope`; the caller owns release. `key` asks a stateful provider for the same logical sandbox, while `image` selects an immutable provider image. `start` exposes an ordered `ExecEvent` stream plus a terminal result; `exec` collects only the result and `stream` exposes only events.

The command vocabulary is explicit:

- `Process` is an operating-system command for leaves that expose one.
- `TypeScript` is a stateful cell in a sandbox-owned namespace.
- `JavaScriptModule` is the exact, fresh module invocation used by the Worker Loader `CodeExecutor` adapter. Its capability service is process-local authority, not serialized data.

A leaf rejects another command kind with `Unsupported`; it never guesses how to translate it.

## Shipped leaves

| Leaf                                        | Isolation    | Commands           | Files         | Pause/resume  | Snapshot | Fork          | Enforced limits    | Billing model                                            |
| ------------------------------------------- | ------------ | ------------------ | ------------- | ------------- | -------- | ------------- | ------------------ | -------------------------------------------------------- |
| `layerBunKernel`                            | `process`    | `TypeScript`       | yes           | yes           | yes      | yes           | wall clock         | host process; no vendor billing claim                    |
| `layerWorktree({ repo })`                   | `process`    | `Process`          | yes           | no            | yes      | yes           | none               | host process; no vendor billing claim                    |
| `generalist/unstable/sandbox/worker-loader` | `v8-isolate` | `JavaScriptModule` | `Unsupported` | `Unsupported` | no       | no            | CPU and wall clock | Workers request CPU and invocation duration              |
| `generalist/unstable/sandbox/e2b`           | `microvm`    | `Process`          | yes           | yes           | yes      | yes           | wall clock         | per-second CPU/RAM while running; paused is not billed   |
| `generalist/unstable/sandbox/daytona`       | configured   | `Process`          | yes           | VM only       | no       | `Unsupported` | wall clock         | active vCPU/RAM/disk; stopped or paused bills disk only  |
| `generalist/unstable/sandbox/fly-sprites`   | `microvm`    | `Process`          | yes           | `Unsupported` | no       | `Unsupported` | wall clock         | active CPU/RAM by second; durable storage remains billed |
| `generalist/unstable/sandbox/modal`         | `container`  | `Process`          | yes           | `Unsupported` | yes      | yes           | wall clock         | per-second CPU/RAM while the Sandbox runs                |
| `generalist/unstable/sandbox/agentos`       | `v8-isolate` | `Process`          | yes           | `Unsupported` | no       | `Unsupported` | CPU and wall clock | host-dependent; actor VMs sleep when idle                |
| `generalist/unstable/sandbox/cloudflare`    | `container`  | `Process`          | yes           | `Unsupported` | no       | `Unsupported` | wall clock         | Containers vCPU, memory, disk, egress, Worker, and DO    |

`process` is a factual process boundary, not confinement. The Bun kernel is for trusted local code: it shares the host operating-system identity and its rooted Effect `FileSystem` is a path view, not a security boundary. It does not claim container or microVM isolation. CPU and per-sandbox memory bounds are unsupported because the Bun leaf cannot enforce them independently.

The worktree leaf is also for trusted local code. Its snapshot stages the complete working tree through a temporary Git index, writes an immutable commit under `refs/generalist/snapshots/`, and forks that commit into a detached temporary worktree. Releasing the Layer removes its worktrees; hidden snapshot refs remain available to later Layers. It does not pause, resume, or enforce resource limits.

`v8-isolate` means a fresh Worker Loader isolate. It is not a container or microVM. The shipped loader disables outbound networking, admits the exact module graph and capability grants, and enforces the provider request's CPU and deadline bounds. It has no persistent filesystem or lifecycle checkpoint, so files, pause, resume, snapshot, and fork fail with typed `Unsupported` errors.

## Limits and cost

CPU and wall clock are different resources:

- CPU time counts active execution. Worker Loader enforces its provider CPU budget even if wall time remains.
- Wall clock counts elapsed time, including waits on timers, host capabilities, and I/O. Supporting leaves bound it.
- Memory is declared only by a provider that can enforce every requested per-sandbox bound. No shipped leaf does.

Pausing the Bun leaf closes its child process and retains the last captured namespace plus workspace files; resume boots lazily on the next cell. That can stop active process cost, but Generalist does not claim a vendor billing guarantee. Worker Loader executions are fresh and have nothing persistent to pause.

The hosted leaves are unstable while their live conformance record matures. E2B pauses with memory and filesystem state on explicit pause, framework auto-pause, and acquisition-scope close. E2B documents that compute billing stops while paused. Daytona requires a factual `sandboxClass`: image builds are containers, while Linux VM sandboxes use an existing VM snapshot. The leaf validates the returned class, labels containers `container` and Linux VMs `microvm`, and exposes explicit pause/resume and framework auto-pause only for Linux VMs. Closing a fresh acquisition deletes it; closing a keyed reconnection pauses a VM or stops a container so the caller's resource remains addressable. Daytona snapshot creation is asynchronous and returns the source sandbox rather than a ready immutable image identity, so snapshot and fork remain `Unsupported`. Fly Sprites are microVMs that hibernate automatically, but automatic hibernation is not an explicit pause/resume operation. Sprite checkpoints restore only the same Sprite and cannot seed an isolated fork, so snapshot and fork also remain `Unsupported`. Closing a fresh Sprite acquisition deletes it, while closing a keyed reconnection leaves the caller-owned Sprite intact. Modal Sandboxes are containers. Their filesystem snapshot returns an immutable Modal image that can seed an isolated fork, but Modal has no explicit pause/resume operation. Fresh and forked Modal Sandboxes are terminated on scope close; keyed reconnections detach without terminating the caller-owned Sandbox. Modal bills requested or actual CPU and memory, whichever is greater, per second while the Sandbox runs. An agentOS actor VM executes guest processes inside a V8 isolate and persists its rooted filesystem across automatic idle sleep. Idle sleep is not explicit pause/resume, and filesystem export cannot be restored through the public actor client, so snapshot and fork remain `Unsupported`. Fresh agentOS actors are destroyed on scope close; keyed actors remain caller-owned. agentOS runs on host capacity rather than defining a universal per-VM price. Cloudflare Sandbox has inactivity sleep but no provider operation matching Generalist's explicit pause/resume contract, so those operations remain `Unsupported`; closing the acquisition scope destroys its container to release resources. Cloudflare bills the underlying Container dimensions plus the Worker and Durable Object that route it.

```ts
import { Config } from "effect"
import * as CloudflareSandbox from "generalist/unstable/sandbox/cloudflare"
import * as Daytona from "generalist/unstable/sandbox/daytona"
import * as E2B from "generalist/unstable/sandbox/e2b"
import * as FlySprites from "generalist/unstable/sandbox/fly-sprites"
import * as ModalSandbox from "generalist/unstable/sandbox/modal"
import * as AgentOS from "generalist/unstable/sandbox/agentos"

const e2b = E2B.layer({
  apiKey: Config.redacted("E2B_API_KEY"),
  template: "generalist-bun",
  autoPauseAfter: "5 minutes",
})

const cloudflare = CloudflareSandbox.layer({ binding: env.SANDBOX })

const daytona = Daytona.layer({
  apiKey: Config.redacted("DAYTONA_API_KEY"),
  image: "ubuntu:22.04",
  sandboxClass: "container",
})

const sprites = FlySprites.layer({
  token: Config.redacted("SPRITES_TOKEN"),
  app: "generalist",
})

const modal = ModalSandbox.layer({
  tokenId: Config.redacted("MODAL_TOKEN_ID"),
  tokenSecret: Config.redacted("MODAL_TOKEN_SECRET"),
  app: "generalist",
  image: "ubuntu:24.04",
})

const agentos = AgentOS.layer({
  endpoint: "https://agentos.example.com",
  token: Config.redacted("AGENTOS_TOKEN"),
  actor: "vm",
})
```

Callers inspect `sandbox.capabilities` before selecting behavior. If a requested capability is absent, they must still execute the operation when checking the boundary and handle its typed `Unsupported` result; silently skipping it would make capability labels unverifiable.

## Snapshots and durable runs

`snapshot` returns an immutable `SnapshotId`. `fork(snapshotId)` creates a new sandbox namespace from that image; mutating the fork does not mutate the source. `fork(snapshotId, { key })` also binds the restored namespace to that logical key, so a later `provider.acquire({ key })` continues the fork. The Bun leaf content-addresses the exact snapshot bytes and manifest, then restores the image under the requested key or a fresh kernel Session identity.

After a successful `CellTool` call, the adapter snapshots capable leaves and emits:

```ts
{
  message: "SandboxSnapshot",
  data: { _tag: "SandboxSnapshot", snapshotId }
}
```

When the leaf cannot snapshot, `CellTool` instead emits the same progress message with `data: { _tag: "SandboxSnapshotUnavailable" }`. Runtime persists either marker with the tool completion, so fork and rewind can distinguish a Run that never used a Sandbox from sandbox state that cannot be restored.

At durable execution bootstrap, Runtime derives the newest valid `SandboxSnapshot` from the authoritative retained journal and places a one-shot restoration hint in `ToolContext`. The first `CellTool` acquisition calls `fork(snapshotId, { key: branchSessionId })`; the hint clears only after that succeeds. Later cells acquire the keyed branch Sandbox, and a snapshot newly journaled by the branch supersedes the inherited image for future recovery. Fork therefore restores the selected source prefix, rewind restores the truncated prefix, and SQL close/reopen does not depend on process memory.

`layerWorktree` is the process-host filesystem leaf for this path: its hidden Git commit is an immutable snapshot, keyed fork binds the detached worktree to the branch Session, and Layer release removes every created worktree. The snapshot is working state only; the Runtime journal, operations, Session entries, and children remain authority.

## Errors

`SandboxError` is closed over:

- `Unsupported`: the leaf does not implement the named operation or limit.
- `Unavailable`: acquisition or connectivity failed before execution.
- `ExecutionFailed`: an admitted command failed; `cause` retains a typed leaf failure when available.
- `LimitExceeded`: an enforced CPU, memory, or wall-clock limit stopped work.
- `SnapshotNotFound`: the immutable image does not exist in this provider.

All boundary failures are schema-backed tagged errors. Adapters such as `CellTool` and `CodeExecutor` only translate those errors into their existing domain contracts; they do not own another execution path.

## Conformance

```ts
import { Testing } from "generalist/testing"
import { layerMySandbox } from "my-generalist-sandbox"

Testing.sandbox({
  name: "My Sandbox",
  isolation: "container",
  layer: layerMySandbox,
})
```

The suite checks command round-trip, streaming, files, pause/resume retention, snapshot/fork isolation, limit enforcement, factual isolation, and typed `Unsupported` behavior. Certification entries are named `sandbox:<provider-name>`.

## Related

- Source: `packages/generalist/src/sandbox/`
- Adapters: `packages/generalist/src/repl/cell-tool.ts`, `packages/generalist/src/cloudflare/dynamic-workers/`
- Conformance: `packages/generalist/src/testing/sandbox.ts`
