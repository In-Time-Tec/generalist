/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { websiteCheckpoints } from "../examples/docs-snippets/website/checkpoints"

class ReadmeCheckFailed extends Schema.TaggedError<ReadmeCheckFailed>()("generalist/scripts/ReadmeCheckFailed", {
  message: Schema.String,
}) {}

const failure = (message: string): ReadmeCheckFailed => ReadmeCheckFailed.make({ message })
const typescriptFence = /^```(?:ts|typescript)[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm
const tsconfig = `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["**/*.ts"]
}
`

const typecheck = Effect.fn("ReadmeCheck.typecheck")(function* (directory: string) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const handle = yield* spawner.spawn(
    ChildProcess.make("bun", ["--bun", "tsc", "--noEmit", "-p", "tsconfig.json"], { cwd: directory }),
  )
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [
      Stream.mkString(Stream.decodeText(handle.stdout)),
      Stream.mkString(Stream.decodeText(handle.stderr)),
      handle.exitCode,
    ],
    { concurrency: 3 },
  )
  if (exitCode !== 0) {
    return yield* failure(`README TypeScript blocks failed to typecheck\n${stdout}${stderr}`)
  }
})

const checkVersions = Effect.fn("ReadmeCheck.checkVersions")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Struct({ version: Schema.String })))(
    yield* fileSystem.readFileString("packages/generalist/package.json"),
  )
  const publicDocs = (yield* fileSystem.readDirectory("docs", { recursive: true }))
    .filter((name) => /\.mdx?$/.test(name) && !name.startsWith("api/") && !name.startsWith("node_modules/"))
    .map((name) => `docs/${name}`)
  for (const filename of ["README.md", "packages/generalist/README.md", ...publicDocs]) {
    const source = yield* fileSystem.readFileString(filename)
    for (const match of source.matchAll(/\bgeneralist@(\d+\.\d+\.\d+(?:-[\w.-]+)?)/g)) {
      if (match[1] !== manifest.version) {
        return yield* failure(`${filename}: install version ${match[1]} differs from generalist@${manifest.version}`)
      }
    }
  }
  return manifest.version
})

const checkOutput = Effect.fn("ReadmeCheck.checkOutput")(function* (
  directory: string,
  target: string,
  filename: string,
  expected: string | undefined,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const output = yield* spawner
    .string(ChildProcess.make("bun", [target], { cwd: directory }))
    .pipe(Effect.timeout("30 seconds"))
  if (expected === undefined || output.trim() !== expected) {
    return yield* failure(`${filename}: output mismatch\nExpected: ${expected}\nActual: ${output}`)
  }
})

const program = Effect.fn("ReadmeCheck.program")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const version = yield* checkVersions()
  const directory = yield* fileSystem.makeTempDirectoryScoped({ directory: root, prefix: ".readme-check-" })
  yield* fileSystem.writeFileString(path.join(directory, "tsconfig.json"), tsconfig)
  yield* fileSystem.symlink(
    path.join(root, "examples/docs-snippets/node_modules"),
    path.join(directory, "node_modules"),
  )

  let count = 0
  for (const filename of [
    "README.md",
    "packages/generalist/README.md",
    "docs/features/cloudflare.md",
    "docs/features/rivet.md",
  ]) {
    const source = yield* fileSystem.readFileString(path.join(root, filename))
    const blocks = Array.from(source.matchAll(typescriptFence), (match) => match[1] ?? "")
    if (blocks.length === 0) return yield* failure(`${filename} contains no \`\`\`ts code blocks`)
    yield* Effect.forEach(
      blocks,
      (block) =>
        Effect.gen(function* () {
          count += 1
          const target = `block-${count}.ts`
          yield* fileSystem.writeFileString(path.join(directory, target), block)
        }),
      { discard: true },
    )
  }

  yield* typecheck(directory)
  const websiteDirectory = path.join(root, "examples/docs-snippets/website")
  yield* Effect.forEach(
    websiteCheckpoints,
    (checkpoint) =>
      checkOutput(websiteDirectory, checkpoint.file, `Website checkpoint ${checkpoint.name}`, checkpoint.output),
    { discard: true },
  )
  yield* Console.log(
    `Public install versions match ${version}; ${count} TypeScript blocks typechecked; ${websiteCheckpoints.length} website checkpoints executed with matching output`,
  )
})

await Effect.runPromise(program().pipe(Effect.scoped, Effect.provide(layer)))
