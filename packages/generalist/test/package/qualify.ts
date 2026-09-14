/* oxlint-disable anti-slop/no-known-value-widening, effecttsgo/prefer-schema-over-json, effecttsgo/strict-effect-provide -- Consumer manifests and executable import probes are generated from runtime package metadata, and the final provide is this executable's application boundary. */
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { BunRuntime } from "@effect/platform-bun"
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class QualificationFailed extends Schema.TaggedError<QualificationFailed>()("generalist/test/QualificationFailed", {
  message: Schema.String,
}) {}

const fail = (message: string): QualificationFailed => QualificationFailed.make({ message })

const run = Effect.fn("PackageQualification.run")(function* (
  command: string,
  args: ReadonlyArray<string>,
  cwd: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const child = yield* spawner.spawn(ChildProcess.make(command, args, { cwd }))
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(child.stdout)),
      Stream.mkString(Stream.decodeText(child.stderr)),
      child.exitCode,
    ],
    { concurrency: 3 },
  )
  if (exitCode !== 0) return yield* fail(`${command} ${args.join(" ")} failed\n${stdout}\n${stderr}`)
  return stdout
})

const Dependencies = Schema.Record(Schema.String, Schema.String)
const RootManifest = Schema.Struct({
  workspaces: Schema.Struct({
    catalog: Dependencies,
  }),
})
const PackageManifest = Schema.Struct({
  peerDependencies: Dependencies,
  exports: Schema.Record(Schema.String, Schema.Unknown),
})
const parseRootManifest = Schema.decodeSync(Schema.fromJsonString(RootManifest))
const parsePackageManifest = Schema.decodeSync(Schema.fromJsonString(PackageManifest))

const privateSpecifiers = [
  "generalist/runtime/engine",
  "generalist/durability/internal/journal",
  "generalist/durability/internal/runtime-command-control",
  "generalist/runtime/state/store/claim",
  "generalist/runtime/execution/recovery/fork-checkpoint",
  "generalist/unstable/providers/openai-account-auth",
  "generalist/providers/openai",
  "generalist/unstable/rivet",
  "generalist/unstable/cloudflare/durable-objects",
  "generalist/unstable/sandbox/e2b",
] as const

const version = (dependencies: Readonly<Record<string, string>>, name: string): string => {
  const found = dependencies[name]
  if (found === undefined) throw fail(`package catalog has no version for ${name}`)
  return found
}

const consumerManifest = (
  tarball: string,
  catalog: Readonly<Record<string, string>>,
  peers: Readonly<Record<string, string>>,
  coreOnly: boolean,
): string => {
  const dependencies: Record<string, string> = {
    generalist: `file:${tarball}`,
    effect: version(peers, "effect"),
    typescript: version(catalog, "typescript"),
    "@types/node": version(catalog, "@types/node"),
  }
  if (!coreOnly) {
    dependencies["@effect/platform-bun"] = version(catalog, "@effect/platform-bun")
    dependencies["@effect/platform-node-shared"] = version(catalog, "@effect/platform-node-shared")
    dependencies["@types/bun"] = version(catalog, "@types/bun")
    for (const name of Object.keys(peers)) {
      if (name !== "effect") dependencies[name] = version(catalog, name)
    }
  }
  return JSON.stringify({ private: true, type: "module", dependencies }, undefined, 2)
}

const tsconfig = (coreOnly: boolean): string =>
  JSON.stringify(
    {
      compilerOptions: {
        target: "ESNext",
        lib: ["ESNext", "DOM", "DOM.Iterable"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        skipLibCheck: true,
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        outDir: "dist",
        types: coreOnly ? ["node"] : ["node", "bun"],
      },
      include: ["*.ts"],
    },
    undefined,
    2,
  )

const assertSingleEffect = Effect.fn("PackageQualification.assertSingleEffect")(function* (directory: string) {
  const found = (yield* run("find", ["node_modules", "-path", "*/effect/package.json", "-print"], directory))
    .trim()
    .split("\n")
    .filter(Boolean)
  if (found.length !== 1) {
    return yield* fail(
      `expected exactly one Effect installation in ${directory}, found ${found.length}: ${found.join(", ")}`,
    )
  }
})

const assertPrivatePathsUnavailable = Effect.fn("PackageQualification.assertPrivatePathsUnavailable")(function* (
  directory: string,
  runtime: "bun" | "node",
) {
  for (const specifier of privateSpecifiers) {
    const expectedCode = runtime === "bun" ? "ERR_MODULE_NOT_FOUND" : "ERR_PACKAGE_PATH_NOT_EXPORTED"
    const source = `import(${JSON.stringify(specifier)}).then(() => { throw new Error("private path resolved") }, error => { if (error?.code !== ${JSON.stringify(expectedCode)}) throw error })`
    const args = runtime === "node" ? ["--input-type=module", "--eval", source] : ["--eval", source]
    yield* run(runtime, args, directory)
  }
})

const assertExportsImport = Effect.fn("PackageQualification.assertExportsImport")(function* (
  directory: string,
  runtime: "bun" | "node",
  exports: ReadonlyArray<string>,
) {
  const specifiers = exports.map((key) => (key === "." ? "generalist" : `generalist${key.slice(1)}`))
  const source = `for (const specifier of ${JSON.stringify(specifiers)}) await import(specifier)`
  const args = runtime === "node" ? ["--input-type=module", "--eval", source] : ["--eval", source]
  yield* run(runtime, args, directory)
})

const writeConsumer = Effect.fn("PackageQualification.writeConsumer")(function* (
  directory: string,
  manifest: string,
  fixture: string,
  fixtureName: string,
  coreOnly: boolean,
  exports: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem
  yield* fs.writeFileString(`${directory}/package.json`, manifest)
  yield* fs.writeFileString(`${directory}/tsconfig.json`, tsconfig(coreOnly))
  yield* fs.writeFileString(`${directory}/${fixtureName}`, fixture)
  const specifiers = exports.map((key) => (key === "." ? "generalist" : `generalist${key.slice(1)}`))
  const exportImports = specifiers
    .map((specifier, index) => `import * as Export${index} from ${JSON.stringify(specifier)}\nvoid Export${index}`)
    .join("\n")
  yield* fs.writeFileString(`${directory}/exports-consumer.ts`, exportImports)
})

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = yield* fs.realPath(".")
  const tarball = path.join(root, "release/generalist.tgz")
  if (!(yield* fs.exists(tarball))) return yield* fail("release/generalist.tgz is missing; run the package build first")
  const rootManifest = parseRootManifest(yield* fs.readFileString(path.join(root, "package.json")))
  const packageManifest = parsePackageManifest(
    yield* fs.readFileString(path.join(root, "packages/generalist/package.json")),
  )
  const packageExports = Object.keys(packageManifest.exports)
  const wildcard = packageExports.filter((key) => key.includes("*"))
  if (wildcard.length > 0) return yield* fail(`add representative imports for wildcard exports: ${wildcard.join(", ")}`)
  const fixtureRoot = path.join(root, "packages/generalist/test/package")
  const coreFixture = yield* fs.readFileString(path.join(fixtureRoot, "core-consumer.ts"))
  const extensionFixture = yield* fs.readFileString(path.join(fixtureRoot, "extensions-consumer.ts"))

  const core = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-core-consumer-" })
  yield* writeConsumer(
    core,
    consumerManifest(tarball, rootManifest.workspaces.catalog, packageManifest.peerDependencies, true),
    coreFixture,
    "core-consumer.ts",
    true,
    packageExports,
  )
  yield* run("bun", ["install", "--ignore-scripts", "--linker", "isolated"], core)
  yield* assertSingleEffect(core)
  yield* run("bun", ["x", "tsc"], core)
  yield* run("bun", ["core-consumer.ts"], core)
  yield* run("node", ["dist/core-consumer.js"], core)
  yield* assertPrivatePathsUnavailable(core, "bun")
  yield* assertPrivatePathsUnavailable(core, "node")

  const bun = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-bun-consumer-" })
  yield* writeConsumer(
    bun,
    consumerManifest(tarball, rootManifest.workspaces.catalog, packageManifest.peerDependencies, false),
    extensionFixture,
    "extensions-consumer.ts",
    false,
    packageExports,
  )
  yield* run("bun", ["install", "--ignore-scripts", "--linker", "isolated"], bun)
  yield* assertSingleEffect(bun)
  yield* run("bun", ["x", "tsc", "--noEmit"], bun)
  yield* run("bun", ["extensions-consumer.ts"], bun)
  yield* assertExportsImport(bun, "bun", packageExports)
  yield* assertPrivatePathsUnavailable(bun, "bun")

  const npm = yield* fs.makeTempDirectoryScoped({ prefix: "generalist-npm-consumer-" })
  yield* writeConsumer(
    npm,
    consumerManifest(tarball, rootManifest.workspaces.catalog, packageManifest.peerDependencies, false),
    extensionFixture,
    "extensions-consumer.ts",
    false,
    packageExports,
  )
  yield* run("npx", ["--yes", "npm@11.6.0", "install", "--ignore-scripts", "--no-package-lock"], npm)
  yield* assertSingleEffect(npm)
  yield* run("npx", ["tsc", "--noEmit"], npm)
  yield* run("bun", ["extensions-consumer.ts"], npm)
  yield* assertExportsImport(npm, "node", packageExports)
  yield* assertPrivatePathsUnavailable(npm, "node")

  yield* Console.log(
    `qualified ${packageExports.length} packed exports and ${privateSpecifiers.length} unavailable private/vendor paths across fresh core-only, Bun-isolated, and npm consumers`,
  )
})

BunRuntime.runMain(Effect.scoped(program).pipe(Effect.provide(bunServices)))
