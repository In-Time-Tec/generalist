import { Duration, Layer } from "effect"
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { ToolContext, ToolExecutor } from "generalist"
import { CellTool, HostBindings, KernelProfile } from "generalist/repl"
import { BunKernelPool, BunKernelSnapshotStore, workerModule } from "generalist/repl/bun"

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
}).pipe(Layer.provide(BunKernelSnapshotStore.layer({ dataRoot })), Layer.provide(bunServices))

export const cellLayer: Layer.Layer<
  ToolExecutor.ToolExecutor | ToolContext.ToolContext,
  HostBindings.HostModuleConflict
> = CellTool.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ToolContext.layerDefault, HostBindings.layer([workspace]), kernelPool)),
)
