# AgentOS CodeExecutor rejected

Generalist does not provide an AgentOS `CodeExecutor`. The exact public artifact tested on 2026-08-30 was
`@rivet-dev/agentos@0.2.15`, which resolved `@rivet-dev/agentos-core@0.2.15` exactly. The engine has useful isolation
and true active-CPU accounting, but its supported public boundary cannot satisfy two mandatory Generalist contracts:
typed terminal attribution and exact output accounting before frame decoding. No adapter, AgentOS dependency, or
competing Agent/session facade is shipped.

## Correct topology and supported boundary

AgentOS 0.2.15 is not an in-process V8/Wasm evaluator. [`AgentOs.createSidecar()` creates a caller-managed
handle](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/src/agent-os.ts#L3147-L3151); the first VM lease
[spawns one native child-process sidecar](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/src/agent-os.ts#L7039-L7055),
and the sidecar runs [V8 isolate sessions](https://github.com/rivet-dev/agentos/blob/v0.2.15/crates/execution/src/v8_runtime.rs#L1-L37).
Passing that handle through `AgentOs.create({ sidecar: { kind: "explicit", handle } })` [leases the VM from that exact
sidecar](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/src/agent-os.ts#L3443-L3451). A prospective
adapter would therefore create one fresh native sidecar plus one V8 isolate per invocation and dispose both. Generalist
names that boundary `sidecar-process-v8-isolate`; it does not claim a container or microVM.

The supported dependency is `@rivet-dev/agentos`. Its [public root statically imports RivetKit, reexports core, and
exports the actor facade](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/agentos/src/index.ts#L1-L38).
The core README explicitly calls `@rivet-dev/agentos-core` an [unsupported transitive implementation
package](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/README.md#L1-L15), so a direct core import is not
an acceptable shortcut.

Isolated npm 10.9.8 installs on Linux x64 measured the cost of that supported boundary. The public package resolved 585
unique package artifacts, contained 623 package manifests, and occupied 1,466,337,627 bytes under `node_modules`; a
core-only comparison resolved 373 artifacts, contained 423 manifests, and occupied 1,204,656,532 bytes. Staying public
therefore added 212 resolved artifacts and 261,681,095 bytes in this environment. That broad graph is a cost, not the
rejection reason.

## Blocking gate: terminal attribution

The V8 engine really does use [a per-thread CPU clock independent of wall
time](https://github.com/rivet-dev/agentos/blob/v0.2.15/crates/v8-runtime/src/timeout.rs#L1-L22). A public-package probe
set `cpuTimeLimitMs: 100` and ran `while (true) {}` in one fresh sidecar while a host timer and a second execution in a
different fresh sidecar progressed. The hostile execution stopped after 583 ms wall time, the host timer advanced 114
times, and the peer succeeded. The CPU mechanism is real and unrelated invocations stayed responsive.

The supported result erased the terminal reason, however. CPU exhaustion, wall-clock exhaustion, and an ordinary guest
throw all returned the same structured fields:

```text
outcome: failed
exitCode: 1
error.code: execution_failed
error.name: ExecutionError
error.message: execution exited with code 1
```

The precise CPU and wall-clock text appeared only in stderr. Guest source controls stderr, so it is not trusted
attribution. `onLimitWarning` is also insufficient: its public contract is explicitly an advisory [near-capacity
warning at about 80%](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/src/agent-os.ts#L775-L792), not a
typed terminal event. A probe with a 1,000 ms CPU budget emitted a warning at 801 ms and then ended in an ordinary guest
throw at about 850 ms. Treating the warning as exhaustion would misclassify that failure. The pinned engine source does
record an internal terminal reason, but the public result does not expose it, and relying on undocumented warning values
at capacity would not establish a supported contract.

AbortSignal cancellation did reject with `AbortError`, which an adapter could correlate with adapter-owned state. That
does not repair CPU attribution or provide the complete required distinction among CPU exhaustion, deadline, guest
failure, host-binding failure, output overflow, sidecar crash, and cleanup failure.

## Blocking gate: output before decode

A second public-package probe configured both `capturedOutputLimitBytes` and `eventPayloadLimitBytes` to 128 bytes, then
logged 1 MiB once. The retained result was truncated to 128 bytes, but `onStdout` received decoded chunks of 1,048,576
and 1 byte. The capture limit therefore did not bound the host-side event path. Omitting Generalist's callback cannot
establish a pre-decode bound because AgentOS itself [maps each complete event chunk to a new
`Uint8Array`](https://github.com/rivet-dev/agentos/blob/v0.2.15/packages/core/src/agent-os.ts#L2886-L2898) before
dispatching public handlers.

The remaining public frame limit cannot close this gap. Setting `v8IpcMaxFrameBytes: 128` made VM creation fail with:

```text
limits.reactor.maxBridgeRequestBytes (16777216) must be <= limits.jsRuntime.v8IpcMaxFrameBytes (128)
```

`AgentOsLimits` does not expose that reactor setting. A frame cap large enough to boot therefore still permits a frame
far beyond a 128-byte request budget. Truncated retained output can identify overflow only after the oversized frame was
decoded, contrary to the `CodeExecutor` requirement to count raw output bytes and stop the producer before unbounded
buffering or result decoding.

## Stopped gates and provenance

The supported artifact and process topology gate passed; terminal attribution and pre-decode output accounting failed
independently. Evaluation stopped there as required. Host-binding caps and disposal fencing, complete freshness, fatal
sidecar containment, the full success/failure resource census, provider conformance, and a user flow are not represented
as passed. Exploratory runs did confirm network denial, AbortSignal interruption, and no remaining AgentOS process after
the tested success and failure paths, but those partial observations are not conformance evidence.

Artifact provenance remains qualified. The public tarball has npm integrity
`sha512-NLJjFNVD0uP/EzGfGOcDaZ+GMx595P9sps/A2aLn+xb/KPUqpc+mxmZi8VYhCj2cr20QBa6jhfA2Ohf+0r72Mg==` and SHA-256
`ffcd2b6b412d63828f2fe9832baef3f1097886620fad7e1304525fbf0fa507eb`; the core tarball has npm integrity
`sha512-uRg3BmbZzDUwWVmCTcd9Iuo1k8GJeuaXE3FnBbFGzAeI7I077KAhYlVejb9TBWHtjYcblVlMnl591vDm0DbpCQ==` and SHA-256
`3508c0536189af7f7e6c6fc37447efff83fe20ab6f453f3a2231e1a4b597f70c`. npm metadata reports git head
`36843a854ef7609a77d160bce1fd6bce2bb7ebd2`, two commits after the GitHub `v0.2.15` tag at
`d7026219dec75a886a11d89857c68327a6f9b94a`. Those intervening commits did not change the public index or core
`agent-os.ts`, and the installed Linux x64 native sidecar digests match the [GitHub v0.2.15 release
assets](https://github.com/rivet-dev/agentos/releases/tag/v0.2.15):
`d384f7657163cc14e1e6ae60a36769bc52fa7f262c78fc658231b7403302c6a6` for the native sidecar and
`bfb57c39cef151d0e2a8fc80e779a439eb0b6d3417f87c29625a4b3708a36fd3` for the legacy sidecar. But the packed
manifests omit repository and git-head fields, while source manifest versions are rewritten from `0.0.1` to `0.2.15`;
the exact JavaScript build-to-commit provenance is not self-contained. The tarball hashes above, not an asserted source
commit, identify what was tested.

Reconsider only when a supported pinned AgentOS boundary exposes stable typed terminal reasons for every Generalist
failure class and enforces the requested cumulative output-byte limit before decoding or callback delivery. A future
adapter must then pass the remaining isolation, binding, crash-containment, cleanup, provider-conformance, and real-flow
gates with one fresh sidecar and V8 isolate per invocation.
