/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class ReadmeCheckFailed extends Schema.TaggedError<ReadmeCheckFailed>()("generalist/scripts/ReadmeCheckFailed", {
  message: Schema.String,
}) {}

const failure = (message: string): ReadmeCheckFailed => ReadmeCheckFailed.make({ message })
const typescriptFence = /^```ts[ \t]*\r?\n([\s\S]*?)^```[ \t]*$/gm
const tsconfig = `{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "rootDir": "."
  },
  "include": ["block-*.ts"]
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

const program = Effect.fn("ReadmeCheck.program")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const root = path.resolve(".")
  const readme = yield* fileSystem.readFileString(path.join(root, "README.md"))
  const blocks = Array.from(readme.matchAll(typescriptFence), (match) => match[1])
  if (blocks.length === 0) return yield* failure("README.md contains no ```ts code blocks")

  const directory = yield* fileSystem.makeTempDirectoryScoped({ directory: root, prefix: ".readme-check-" })
  yield* fileSystem.writeFileString(path.join(directory, "tsconfig.json"), tsconfig)
  yield* Effect.forEach(blocks, (block, index) =>
    fileSystem.writeFileString(path.join(directory, `block-${index + 1}.ts`), block ?? ""),
  )
  yield* typecheck(directory)
  yield* Console.log(`README TypeScript blocks: ${blocks.length} passed`)
})

await Effect.runPromise(program().pipe(Effect.scoped, Effect.provide(layer)))
