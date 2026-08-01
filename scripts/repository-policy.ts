import { readdirSync } from "node:fs"
import { join } from "node:path"
import { Effect, FileSystem, Path } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { runMain } from "@effect/platform-bun/BunRuntime"

const sourceFiles = (root: string): Array<string> => {
  const files: Array<string> = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated"]).has(entry.name)) visit(path)
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        path.includes("/packages/") &&
        !path.includes("/test/") &&
        !entry.name.endsWith(".test.ts")
      )
        files.push(path)
    }
  }
  visit(root)
  return files
}

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const violations: Array<string> = []
  for (const file of sourceFiles(root)) {
    const lines = (yield* fileSystem.readFileString(file)).split("\n").length - 1
    if (lines > 500) violations.push(`${path.relative(root, file)}: ${lines} lines (maximum 500)`)
  }
  if (violations.length > 0) return yield* Effect.fail(new Error(violations.join("\n")))
  yield* Effect.logInfo("repository policy passed")
}).pipe(Effect.provide(layer))

runMain(program)
