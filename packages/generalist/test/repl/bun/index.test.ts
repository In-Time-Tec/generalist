import { expect, layer } from "@effect/vitest"
import { Effect, FileSystem } from "effect"
import { workerModule as exportedWorkerModule, workerSupportModules } from "../../../src/repl/bun/index.js"
import { liveOptions, platform, runCell, withPool } from "../bun-harness.js"

layer(platform, liveOptions)("Bun kernel worker module", (it) => {
  it.effect("exports the worker and every relocatable dependency from one directory", () =>
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem
      expect(exportedWorkerModule.endsWith("worker.js") || exportedWorkerModule.endsWith("worker.ts")).toBe(true)
      expect(yield* fileSystem.exists(exportedWorkerModule)).toBe(true)
      expect(workerSupportModules.map((module) => module.slice(module.lastIndexOf("/") + 1))).toEqual([
        exportedWorkerModule.endsWith(".ts") ? "command-lines.ts" : "command-lines.js",
        exportedWorkerModule.endsWith(".ts") ? "worker-error.ts" : "worker-error.js",
        exportedWorkerModule.endsWith(".ts") ? "text-result.ts" : "text-result.js",
        exportedWorkerModule.endsWith(".ts") ? "value.ts" : "value.js",
      ])
      expect(
        workerSupportModules.every(
          (module) =>
            module.slice(0, module.lastIndexOf("/")) ===
            exportedWorkerModule.slice(0, exportedWorkerModule.lastIndexOf("/")),
        ),
      ).toBe(true)
      for (const module of workerSupportModules) expect(yield* fileSystem.exists(module)).toBe(true)
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
