/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect"
import { Command, Flag } from "effect/unstable/cli"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class ApiDocumentationFailed extends Schema.TaggedError<ApiDocumentationFailed>()(
  "generalist/scripts/ApiDocumentationFailed",
  { message: Schema.String },
) {}

const ExportTarget = Schema.Struct({ types: Schema.String })
const PackageManifest = Schema.Struct({
  name: Schema.String,
  exports: Schema.Record(Schema.String, ExportTarget),
})
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))
const failure = (message: string): ApiDocumentationFailed => ApiDocumentationFailed.make({ message })

const entryName = (specifier: string): string =>
  specifier === "." ? "generalist" : specifier.slice(2).replaceAll("/", ".")

const generatedFiles = Effect.fn("DocsApi.generatedFiles")(function* (
  fileSystem: FileSystem.FileSystem,
  directory: string,
) {
  const files = (yield* fileSystem.readDirectory(directory, { recursive: true })).filter(
    (name) => name.endsWith(".md") || name.endsWith(".json"),
  )
  files.sort()
  return files
})

const runTypeDoc = Effect.fn("DocsApi.runTypeDoc")(function* (directory: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make("bun", ["--cwd", "docs", "typedoc", "--options", `${directory}/options.json`]),
  )
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
    ],
    { concurrency: 3 },
  )
  if (exitCode !== 0) return yield* failure(`TypeDoc failed\n${stdout}${stderr}`)
  const output = `${stdout}${stderr}`.trim()
  if (output.length > 0) yield* Console.log(output)
})

const program = Effect.fn("DocsApi.program")(function* (check: boolean) {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const packageDirectory = path.join(root, "packages/generalist")
  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(
    yield* fileSystem.readFileString(path.join(packageDirectory, "package.json")),
  )
  const targets = Object.entries(manifest.exports)
  targets.sort(([left], [right]) => left.localeCompare(right))
  const directory = yield* fileSystem.makeTempDirectoryScoped({ directory: root, prefix: ".typedoc-" })
  const entries: Array<string> = []

  for (const [specifier, target] of targets) {
    if (!target.types.startsWith("./dist/") || !target.types.endsWith(".d.ts")) {
      return yield* failure(`${manifest.name} export ${specifier} has unsupported types target ${target.types}`)
    }
    const declaration = path.resolve(packageDirectory, target.types)
    if (!(yield* fileSystem.exists(declaration))) {
      return yield* failure(`${declaration} does not exist; build ${manifest.name} before generating its API docs`)
    }
    const name = `${entryName(specifier)}.d.ts`
    const modulePath = path.relative(directory, declaration).replace(/\.d\.ts$/, ".js")
    yield* fileSystem.writeFileString(path.join(directory, name), `export * from "${modulePath}"\n`)
    entries.push(name)
  }

  const compiler = {
    compilerOptions: {
      module: "NodeNext",
      moduleResolution: "NodeNext",
      skipLibCheck: true,
      target: "ES2022",
    },
    files: entries,
  } satisfies Schema.Json
  const options = {
    alwaysCreateEntryPointModule: true,
    basePath: ".",
    disableSources: true,
    displayBasePath: ".",
    entryFileName: "index",
    entryPoints: entries,
    entryPointStrategy: "resolve",
    excludeExternals: true,
    name: manifest.name,
    out: "generated",
    plugin: ["typedoc-plugin-markdown"],
    readme: "none",
    router: "module",
    skipErrorChecking: true,
    tsconfig: "tsconfig.json",
  } satisfies Schema.Json
  yield* fileSystem.writeFileString(path.join(directory, "tsconfig.json"), `${encodeJson(compiler)}\n`)
  yield* fileSystem.writeFileString(path.join(directory, "options.json"), `${encodeJson(options)}\n`)
  yield* runTypeDoc(directory)

  const generatedDirectory = path.join(directory, "generated")
  const markdownFiles = (yield* generatedFiles(fileSystem, generatedDirectory)).filter((name) => name.endsWith(".md"))
  for (const name of markdownFiles) {
    const file = path.join(generatedDirectory, name)
    const source = yield* fileSystem.readFileString(file)
    yield* fileSystem.writeFileString(
      file,
      source.replaceAll(
        /\]\(([^)\s]+)\.md(?=(?:#[^)]+)?\))/g,
        (_, target: string) => `](${target.startsWith(".") ? target : `./${target}`}`,
      ),
    )
  }
  const pages = markdownFiles.map((name) => `api/${name.slice(0, -3).replaceAll("\\", "/")}`)
  pages.sort((left, right) => {
    if (left === "api/index") return -1
    if (right === "api/index") return 1
    return left.localeCompare(right)
  })
  yield* fileSystem.writeFileString(
    path.join(generatedDirectory, "navigation.json"),
    `${encodeJson({ group: "API reference", pages })}\n`,
  )

  const outputPath = path.join(root, "docs/api")
  if (!check) {
    yield* fileSystem.remove(outputPath, { recursive: true, force: true })
    yield* fileSystem.copy(generatedDirectory, outputPath)
    yield* Console.log(`${outputPath} generated from ${targets.length} package exports in ${pages.length} pages`)
    return
  }
  if (!(yield* fileSystem.exists(outputPath))) {
    return yield* failure("docs/api has drifted; run bun run docs:api")
  }
  const expectedFiles = yield* generatedFiles(fileSystem, generatedDirectory)
  const actualFiles = yield* generatedFiles(fileSystem, outputPath)
  if (expectedFiles.join("\n") !== actualFiles.join("\n")) {
    return yield* failure("docs/api has drifted; run bun run docs:api")
  }
  for (const name of expectedFiles) {
    const expected = (yield* fileSystem.readFileString(path.join(generatedDirectory, name))).replaceAll(
      path.basename(directory),
      ".typedoc",
    )
    if ((yield* fileSystem.readFileString(path.join(outputPath, name))) !== expected) {
      return yield* failure(`docs/api/${name} has drifted; run bun run docs:api`)
    }
  }
  yield* Console.log(`docs/api matches ${targets.length} package exports in ${pages.length} pages`)
})

const command = Command.make("docs-api", { check: Flag.boolean("check").pipe(Flag.withDefault(false)) }, ({ check }) =>
  program(check),
)

await Effect.runPromise(Command.run(command, { version: "1" }).pipe(Effect.scoped, Effect.provide(layer)))
