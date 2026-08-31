import { Effect, FileSystem, ManagedRuntime, Path, Schema } from "effect"
import { layer } from "@effect/platform-bun/BunServices"
import { version as bunVersion } from "bun"

class InstallPreflightFailed extends Schema.TaggedError<InstallPreflightFailed>()(
  "generalist/scripts/InstallPreflightFailed",
  { message: Schema.String },
) {}

const preflightError = (message: string): InstallPreflightFailed => InstallPreflightFailed.make({ message })

const RootManifest = Schema.Struct({
  workspaces: Schema.optionalKey(Schema.Struct({ packages: Schema.optionalKey(Schema.Array(Schema.String)) })),
})
const PackageManifest = Schema.Struct({
  name: Schema.optionalKey(Schema.String),
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  peerDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
})

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  if (!/^1\.[3-9]\./.test(bunVersion)) {
    return yield* preflightError(`Bun >=1.3 is required (found ${bunVersion})`)
  }
  const root = path.resolve(".")
  if (!(yield* fileSystem.exists(path.join(root, "bun.lock")))) {
    return yield* preflightError("bun.lock is required")
  }
  const rootManifest = yield* Schema.decodeEffect(Schema.fromJsonString(RootManifest))(
    yield* fileSystem.readFileString(path.join(root, "package.json")),
  )
  if (rootManifest.workspaces?.packages?.includes("packages/*") !== true) {
    return yield* preflightError("root workspace must include packages/*")
  }
  const packageDirectory = path.join(root, "packages")
  const packageNames = (yield* fileSystem.readDirectory(packageDirectory)).filter((name) => !name.startsWith("."))
  if (packageNames.length !== 1 || packageNames[0] !== "generalist") {
    return yield* preflightError(`packages/ must contain exactly the generalist package: ${packageNames.join(", ")}`)
  }
  const manifestPath = path.join(packageDirectory, "generalist", "package.json")
  const source = yield* fileSystem.readFileString(manifestPath)
  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(source)
  if (manifest.name !== "generalist") {
    return yield* preflightError(`${manifestPath} has a non-canonical package name`)
  }
  yield* Effect.logInfo(`install preflight passed for Bun ${bunVersion}`)
})

const runtime = ManagedRuntime.make(layer)
await runtime.runPromise(program)
