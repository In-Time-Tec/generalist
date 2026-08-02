import { readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { Effect, FileSystem, Path } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { runMain } from "@effect/platform-bun/BunRuntime"

const ignored = new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated", ".git"])
const roots = ["apps", "examples", "packages", "scripts", "tooling"]
const sourceFiles = (root: string): Array<string> => {
  const files: Array<string> = []
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).toSorted((left, right) =>
      left.name.localeCompare(right.name),
    )) {
      if (ignored.has(entry.name)) continue
      const file = join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (
        entry.isFile() &&
        /\.(?:ts|tsx)$/.test(entry.name) &&
        !file.includes("/test/") &&
        !/\.(?:test|spec)\.(?:ts|tsx)$/.test(entry.name)
      )
        files.push(file)
    }
  }
  for (const directory of roots) visit(join(root, directory))
  return files.toSorted()
}

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const violations: Array<string> = []
  for (const file of sourceFiles(root)) {
    const lines = (yield* fileSystem.readFileString(file)).split("\n").length - 1
    if (lines > 500) violations.push(`${relative(root, file)}: ${lines} lines (maximum 500)`)
  }
  if (violations.length > 0) return yield* Effect.fail(new Error(violations.join("\n")))
  yield* Effect.logInfo("repository policy passed")
}).pipe(Effect.provide(layer))

runMain(program)
