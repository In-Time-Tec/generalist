import { Effect, FileSystem, ManagedRuntime, Path, Schema } from "effect"
import { layer } from "@effect/platform-bun/BunServices"

class InstallPreflightFailed extends Schema.TaggedErrorClass<InstallPreflightFailed>()(
  "@batonfx/scripts/InstallPreflightFailed",
  { message: Schema.String },
) {}

const preflightError = (message: string): InstallPreflightFailed => InstallPreflightFailed.make({ message })

const parseJson = (text: string): Record<string, any> =>
  Schema.decodeUnknownSync(Schema.fromJsonString(Schema.Record(Schema.String, Schema.Any)))(text)

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!/^1\.[3-9]\./.test(Bun.version)) {
    return yield* preflightError(`Bun >=1.3 is required (found ${Bun.version})`)
  }
  const root = path.resolve(".")
  if (!(yield* fileSystem.exists(path.join(root, "bun.lock")))) {
    return yield* preflightError("bun.lock is required")
  }
  const rootManifest = parseJson(yield* fileSystem.readFileString(path.join(root, "package.json"))) as {
    readonly workspaces?: { readonly packages?: ReadonlyArray<string> }
  }
  if (rootManifest.workspaces?.packages?.includes("packages/*") !== true) {
    return yield* preflightError("root workspace must include packages/*")
  }
  const packageDirectory = path.join(root, "packages")
  const packageNames = yield* fileSystem.readDirectory(packageDirectory)
  for (const packageName of packageNames.filter((name) => !name.startsWith("."))) {
    const manifestPath = path.join(packageDirectory, packageName, "package.json")
    if (!(yield* fileSystem.exists(manifestPath))) continue
    const source = yield* fileSystem.readFileString(manifestPath)
    const manifest = parseJson(source) as {
      readonly name?: string
      readonly dependencies?: Readonly<Record<string, string>>
      readonly devDependencies?: Readonly<Record<string, string>>
      readonly peerDependencies?: Readonly<Record<string, string>>
    }
    if (manifest.name !== `@batonfx/${packageName}`) {
      return yield* preflightError(`${manifestPath} has a non-canonical package name`)
    }
    for (const dependencies of [manifest.dependencies, manifest.devDependencies, manifest.peerDependencies]) {
      for (const [dependency, version] of Object.entries(dependencies ?? {})) {
        if (dependency.startsWith("@batonfx/") && version !== "workspace:*") {
          return yield* preflightError(`${manifestPath} must use workspace:* for ${dependency}`)
        }
      }
    }
  }
  yield* Effect.logInfo(`install preflight passed for Bun ${Bun.version}`)
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
