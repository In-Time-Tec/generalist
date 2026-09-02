import { Duration, Effect, FileSystem, Layer } from "effect"
import { KernelPool, KernelSnapshotStore } from "../../src/repl/index.js"
import { SandboxProvider, makeBunKernelProvider } from "../../src/sandbox/index.js"
import { Testing } from "../../src/testing/index.js"
import { makeHarness, platform } from "../repl/bun-harness.js"

const bunKernel = Layer.effect(
  SandboxProvider,
  Effect.gen(function* () {
    const files = yield* FileSystem.FileSystem
    const workspaceRoot = yield* files.makeTempDirectoryScoped({ prefix: "generalist-sandbox-" })
    const harness = yield* makeHarness({ workspaceRoot, cellDeadlineMillis: 5_000 })
    return yield* makeBunKernelProvider({
      image: `bun:${Bun.version}`,
      workspaceRoot,
      limits: { wallClock: Duration.seconds(5) },
    }).pipe(
      Effect.provideService(KernelPool.KernelPool, harness.pool),
      Effect.provideService(KernelSnapshotStore.KernelSnapshotStore, harness.store),
    )
  }),
).pipe(Layer.provide(platform))

Testing.sandbox({ name: "BunKernel", isolation: "process", layer: bunKernel })
