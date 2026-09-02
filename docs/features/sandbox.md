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

| Leaf                                     | Isolation    | Commands           | Files         | Pause/resume  | Snapshot | Fork          | Enforced limits    | Billing model                                          |
| ---------------------------------------- | ------------ | ------------------ | ------------- | ------------- | -------- | ------------- | ------------------ | ------------------------------------------------------ |
| `layerBunKernel`                         | `process`    | `TypeScript`       | yes           | yes           | yes      | yes           | wall clock         | host process; no vendor billing claim                  |
| `layerWorkerLoader`                      | `v8-isolate` | `JavaScriptModule` | `Unsupported` | `Unsupported` | no       | no            | CPU and wall clock | Workers request CPU and invocation duration            |
| `generalist/unstable/sandbox/e2b`        | `microvm`    | `Process`          | yes           | yes           | yes      | yes           | wall clock         | per-second CPU/RAM while running; paused is not billed |
| `generalist/unstable/sandbox/cloudflare` | `container`  | `Process`          | yes           | `Unsupported` | no       | `Unsupported` | wall clock         | Containers vCPU, memory, disk, egress, Worker, and DO  |

`process` is a factual process boundary, not confinement. The Bun kernel is for trusted local code: it shares the host operating-system identity and its rooted Effect `FileSystem` is a path view, not a security boundary. It does not claim container or microVM isolation. CPU and per-sandbox memory bounds are unsupported because the Bun leaf cannot enforce them independently.

`v8-isolate` means a fresh Worker Loader isolate. It is not a container or microVM. The shipped loader disables outbound networking, admits the exact module graph and capability grants, and enforces the provider request's CPU and deadline bounds. It has no persistent filesystem or lifecycle checkpoint, so files, pause, resume, snapshot, and fork fail with typed `Unsupported` errors.

## Limits and cost

CPU and wall clock are different resources:

- CPU time counts active execution. Worker Loader enforces its provider CPU budget even if wall time remains.
- Wall clock counts elapsed time, including waits on timers, host capabilities, and I/O. Both leaves bound it.
- Memory is declared only by a provider that can enforce a per-sandbox bound. Neither shipped leaf does.

Pausing the Bun leaf closes its child process and retains the last captured namespace plus workspace files; resume boots lazily on the next cell. That can stop active process cost, but Generalist does not claim a vendor billing guarantee. Worker Loader executions are fresh and have nothing persistent to pause.

The hosted leaves are unstable while their live conformance record matures. E2B pauses with memory and filesystem state on explicit pause, framework auto-pause, and acquisition-scope close. E2B documents that compute billing stops while paused. Cloudflare Sandbox has inactivity sleep but no provider operation matching Generalist's explicit pause/resume contract, so those operations remain `Unsupported`; closing the acquisition scope destroys its container to release resources. Cloudflare bills the underlying Container dimensions plus the Worker and Durable Object that route it.

```ts
import { Config } from "effect"
import * as CloudflareSandbox from "generalist/unstable/sandbox/cloudflare"
import * as E2B from "generalist/unstable/sandbox/e2b"

const e2b = E2B.layer({
  apiKey: Config.redacted("E2B_API_KEY"),
  template: "generalist-bun",
  autoPauseAfter: "5 minutes",
})

const cloudflare = CloudflareSandbox.layer({ binding: env.SANDBOX })
```

Callers inspect `sandbox.capabilities` before selecting behavior. If a requested capability is absent, they must still execute the operation when checking the boundary and handle its typed `Unsupported` result; silently skipping it would make capability labels unverifiable.

## Snapshots and durable runs

`snapshot` returns an immutable `SnapshotId`. `fork(snapshotId)` creates a new sandbox namespace from that image; mutating the fork does not mutate the source. The Bun leaf content-addresses the exact snapshot bytes and manifest, then restores the image under a fresh kernel Session identity.

After a successful `CellTool` call, the adapter snapshots capable leaves and emits:

```ts
{
  message: "SandboxSnapshot",
  data: { _tag: "SandboxSnapshot", snapshotId }
}
```

Runtime persists that `ToolProgress` with the tool completion. A reopened host can read the latest committed `SnapshotId`, fork it, and continue the Session without executing earlier cells again. The snapshot is working state only; the Runtime journal, operations, Session entries, and children remain authority.

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
