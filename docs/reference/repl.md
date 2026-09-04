---
title: "generalist/repl"
description: "The one typescript cell tool, cell result and failure schemas, KernelProfile, and the kernel ports."
---

generalist/repl gives an agent one persistent TypeScript cell per Session. The root export is contracts only, so projections, decoders, and test hosts import it without any worker code; generalist/repl/bun carries the Bun kernel and is the only module with process dependencies.

**Install**

```bash
bun add effect@4.0.0-rc.112 generalist
```

`generalist/repl` and `generalist/repl/bun` are import subpaths, not packages.

## Exports map

| Subpath | Contents                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------- |
| `.`     | Namespaces `Cell`, `CellTool`, `KernelProfile`, `KernelPool`, `KernelSnapshotStore`, `HostBindings`, and `TestKernel` |
| `./bun` | The Bun kernel implementation; the only module with process dependencies                                              |

## CellTool

`CellTool.tool` is one Effect AI tool named `typescript` whose parameters are exactly one bounded string field named `code` (`CellTool.maxSourceBytes`, 64 KiB). Success is `Cell.CellResult`; failure is `Cell.CellFailure` with `failureMode: "return"`, so a failed cell re-enters the model as an observation instead of failing the run.

`CellTool.layer` provides `ToolExecutor.ToolExecutor` over `ToolContext` and `KernelPool`: it passes the call's `signal` into the kernel, emits one progress update per cell event, and maps the terminal outcome. One shared namespace means `CellTool.scheduling` is always `{ maxConcurrency: 1, parallelSafe: [] }`, so every cell is an authored-order exclusive barrier.

## Cell result, failures, and events

| Type                      | Meaning                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `CellResult`              | Complete formatted value, stdout and stderr, duration, and kernel epoch    |
| `CellExecutionFailed`     | The cell threw; the namespace, the kernel, and every prior binding survive |
| `KernelUnavailable`       | No kernel could run the cell; nothing was evaluated                        |
| `KernelProtocolViolation` | The kernel broke the cell protocol                                         |
| `CellOutcomeUnknown`      | The cell may or may not have committed; a host resolves it explicitly      |

`Cell.CellEvent` is the closed union of `KernelStarting`, `KernelReady`, `Stdout`, `Stderr`, `Result`, `Display`, `StateRestored`, `StateLost`, and `KernelRestarted`. Every event carries its `cellId` and a cell-local `sequence` that starts at 0 and increases by exactly one. `Cell.validateSequence({ sessionId, events })` rejects a gap, a repeat, a non-zero start, and interleaving from a second cell.

## KernelProfile

`KernelProfile.make` pins one kernel epoch: contract and protocol versions, runtime identity and digest, bindings digest, workspace paths, ingestion limits, and trust mode. It declares no secret-bearing field, and unknown keys are dropped from both the encoded form and the digest; the content of its free-text identifier and path fields is host-supplied and is not scanned, so a host that embeds a secret in a path persists and renders it. A foreign protocol version fails to decode. `KernelProfile.digest` is the content-addressed identity, and `KernelProfile.bindingsDigest(names)` is independent of mount order.

## Kernel ports

| Service               | Members                                               |
| --------------------- | ----------------------------------------------------- |
| `KernelPool`          | `execute`, `inspect`, `interrupt`, `restart`, `close` |
| `KernelSnapshotStore` | `load`, `save`, `drop`                                |
| `HostBindings`        | `descriptors`, `resolve`, `invoke`                    |

`HostBindings.make(modules)` mounts named Schema-typed host modules into the kernel namespace and rejects duplicate module or operation names. Operation failures are tagged so a cell discriminates them as data, and schema faults report their stage.

## State is working memory

Kernel variables are never durable authority. Generalist operations, events, Session entries, and children remain the only truth; a restart reports exactly which bindings were restored and which were lost; and an uncertain cell is never replayed. `KernelSnapshotStore` snapshots are best effort, and their manifest names every restored and every dropped binding.

## TestKernel

`TestKernel.layerTestPool({ profile, script? })` and `TestKernel.layerMemoryStore` evaluate nothing but enforce the observable contract, so hosts and projections are tested without a worker process. See [generalist tools](/reference/core-tools) for the executor and progress seams they compose with.
