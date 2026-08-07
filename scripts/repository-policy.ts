import { Effect, FileSystem, Path, PlatformError, Schema } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { runMain } from "@effect/platform-bun/BunRuntime"

const ignored = new Set(["node_modules", "dist", "coverage", ".turbo", "repos", "generated", ".git"])
const roots = ["apps", "examples", "packages", "scripts", "tooling"]

class RepositoryPolicyFailed extends Schema.TaggedErrorClass<RepositoryPolicyFailed>()(
  "@batonfx/scripts/RepositoryPolicyFailed",
  { message: Schema.String },
) {}

const policyError = (message: string): RepositoryPolicyFailed => RepositoryPolicyFailed.make({ message })

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const violations: Array<string> = []
  const visit = (directory: string): Effect.Effect<void, PlatformError> =>
    Effect.gen(function* () {
      const entries = yield* fileSystem.readDirectory(directory)
      for (const name of entries.toSorted((left, right) => left.localeCompare(right))) {
        if (ignored.has(name)) continue
        const file = path.join(directory, name)
        const info = yield* fileSystem.stat(file)
        const isDirectory = info.type === "Directory"
        if (isDirectory) {
          yield* visit(file)
          continue
        }
        if (
          !/\.(?:ts|tsx)$/.test(name) ||
          file.includes("/test/") ||
          /\.(?:test|spec)\.(?:ts|tsx)$/.test(name)
        )
          continue
        const lines = (yield* fileSystem.readFileString(file)).split("\n").length - 1
        if (lines > 500) violations.push(`${path.relative(root, file)}: ${lines} lines (maximum 500)`)
      }
    })
  for (const directory of roots) {
    yield* visit(path.join(root, directory))
  }
  if (violations.length > 0) return yield* policyError(violations.join("\n"))
  yield* Effect.logInfo("repository policy passed")
}).pipe(Effect.provide(layer))

runMain(program)
