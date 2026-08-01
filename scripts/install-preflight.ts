import { Effect, FileSystem, Path } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { runMain } from "@effect/platform-bun/BunRuntime"

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!/^1\.[3-9]\./.test(Bun.version)) {
    return yield* Effect.fail(new Error(`Bun >=1.3 is required (found ${Bun.version})`))
  }
  const root = path.resolve(".")
  if (!(yield* fileSystem.exists(path.join(root, "bun.lock")))) {
    return yield* Effect.fail(new Error("bun.lock is required"))
  }
  const rootManifest = JSON.parse(yield* fileSystem.readFileString(path.join(root, "package.json"))) as {
    readonly workspaces?: { readonly packages?: ReadonlyArray<string> }
  }
  if (rootManifest.workspaces?.packages?.includes("packages/*") !== true) {
    return yield* Effect.fail(new Error("root workspace must include packages/*"))
  }
  const packageDirectory = path.join(root, "packages")
  const packageNames = yield* fileSystem.readDirectory(packageDirectory)
  for (const packageName of packageNames.filter((name) => !name.startsWith("."))) {
    const manifestPath = path.join(packageDirectory, packageName, "package.json")
    if (!(yield* fileSystem.exists(manifestPath))) continue
    const source = yield* fileSystem.readFileString(manifestPath)
    const manifest = JSON.parse(source) as {
      readonly name?: string
      readonly dependencies?: Readonly<Record<string, string>>
      readonly devDependencies?: Readonly<Record<string, string>>
      readonly peerDependencies?: Readonly<Record<string, string>>
    }
    if (manifest.name !== `@batonfx/${packageName}`) {
      return yield* Effect.fail(new Error(`${manifestPath} has a non-canonical package name`))
    }
    for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]) {
      for (const [dependency, version] of Object.entries(dependencies ?? {})) {
        if (dependency.startsWith("@batonfx/") && version !== "workspace:*") {
          return yield* Effect.fail(new Error(`${manifestPath} must use workspace:* for ${dependency}`))
        }
      }
    }
  }
  yield* Effect.logInfo(`install preflight passed for Bun ${Bun.version}`)
}).pipe(Effect.scoped, Effect.provide(layer))

runMain(program)
