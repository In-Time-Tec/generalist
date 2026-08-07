import { Effect, FileSystem, ManagedRuntime, Path, Schema } from "effect"
import { layer } from "@effect/platform-bun/BunServices"

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
  const pending: Array<string> = roots.map((directory) => path.join(root, directory))
  while (pending.length > 0) {
    const directory = pending.pop()!
    const entries = yield* fileSystem.readDirectory(directory)
    for (const name of entries.toSorted((left, right) => left.localeCompare(right))) {
      if (ignored.has(name)) continue
      const file = path.join(directory, name)
      const info = yield* fileSystem.stat(file)
      if (info.type === "Directory") {
        pending.push(file)
        continue
      }
      if (!/\.(?:ts|tsx)$/.test(name) || file.includes("/test/") || /\.(?:test|spec)\.(?:ts|tsx)$/.test(name)) continue
      const lines = (yield* fileSystem.readFileString(file)).split("\n").length - 1
      if (lines > 500) violations.push(`${path.relative(root, file)}: ${lines} lines (maximum 500)`)
    }
  }
  if (violations.length > 0) return yield* policyError(violations.join("\n"))
  yield* Effect.logInfo("repository policy passed")
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
