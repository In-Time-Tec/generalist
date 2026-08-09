import { Duration, Layer } from "effect"
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { ToolContext, ToolExecutor } from "@batonfx/core"
import { CellTool, HostBindingRegistry, KernelProfile } from "@batonfx/repl"
import { BunKernelPool, BunKernelStateStore, workerModule } from "@batonfx/repl/bun"

declare const workspace: HostBindingRegistry.Module
declare const dataRoot: string
declare const bunVersion: string

const profile = KernelProfile.make({
  runtime: { name: "bun", version: bunVersion, digest: "runtime-digest" },
  bindingsDigest: KernelProfile.bindingsDigest(["workspace"]),
  workspace: { root: "/workspace/cell-agent", dataRoot },
  limits: { sourceBytes: CellTool.maxSourceBytes, channelBytes: 262_144, cellDeadlineMillis: 120_000 },
  trustMode: "trusted-local",
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
}).pipe(Layer.provide(BunKernelStateStore.layer({ dataRoot })), Layer.provide(bunServices))

export const cellLayer: Layer.Layer<
  ToolExecutor.ToolExecutor | ToolContext.ToolContext,
  HostBindingRegistry.HostBindingConflict
> = CellTool.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(ToolContext.layerDefault, HostBindingRegistry.layer([workspace]), kernelPool)),
)
