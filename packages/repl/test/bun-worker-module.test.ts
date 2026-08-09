import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { workerModule as exportedWorkerModule } from "../src/repl/bun.js"
import { liveOptions, platform, runCell, withPool } from "./bun-harness.js"

layer(platform, liveOptions)("Bun kernel worker module", (it) => {
  /**
   * A host composing a pool needs a spawnable path to the worker. The worker is not an importable
   * entrypoint, so the `./bun` subpath exporting its resolved path is the only supported way to
   * locate it; without this a downstream host cannot construct a pool at all.
   */
  it.effect("exports a worker module path that exists on disk", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      expect(exportedWorkerModule.endsWith("bun-worker.js") || exportedWorkerModule.endsWith("bun-worker.ts")).toBe(
        true,
      )
      expect(yield* fileSystem.exists(exportedWorkerModule)).toBe(true)
    }),
  )

  it.effect("resolves an absolute path, independent of the working directory", () =>
    Effect.sync(() => {
      expect(exportedWorkerModule.startsWith("/")).toBe(true)
    }),
  )

  it.effect("runs a cell on a pool composed with the exported worker path", () =>
    withPool({
      overrides: { workerModuleOverride: exportedWorkerModule },
      use: ({ pool }) =>
        Effect.gen(function* () {
          const result = yield* runCell({ pool, sessionId: "s", cellId: "c1", code: "21 * 2" })
          expect(result.value).toBe("42")
        }),
    }),
  )
})
