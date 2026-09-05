/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

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
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Struct({ version: Schema.String })))(
    yield* fileSystem.readFileString("packages/generalist/package.json"),
  )
  const publicDocs = yield* spawner.lines(
    ChildProcess.make("rg", ["--files", "docs", "-g", "*.md", "-g", "*.mdx", "-g", "!api/**"]),
  )
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
  source: string,
  block: string,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const output = yield* spawner
    .string(ChildProcess.make("bun", [target], { cwd: directory }))
    .pipe(Effect.timeout("30 seconds"))
  const end = source.indexOf(block) + block.length
  const expected = /^```text\r?\n([\s\S]*?)^```/m.exec(source.slice(end))?.[1]?.trim()
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
  let executed = 0
  for (const filename of [
    "README.md",
    "packages/generalist/README.md",
    "docs/getting-started.md",
    "docs/start/quickstart.md",
    "docs/guides/define-tools.md",
    "docs/start/cell-agent.md",
  ]) {
    const source = yield* fileSystem.readFileString(path.join(root, filename))
    const blocks = Array.from(source.matchAll(typescriptFence), (match) => match[1] ?? "")
    if (blocks.length === 0) return yield* failure(`${filename} contains no \`\`\`ts code blocks`)
    for (const block of blocks) {
      count += 1
      const target = `block-${count}.ts`
      yield* fileSystem.writeFileString(path.join(directory, target), block)
      if (
        filename === "docs/start/quickstart.md" ||
        filename === "docs/guides/define-tools.md" ||
        (filename === "docs/start/cell-agent.md" && !block.includes("declare const"))
      ) {
        yield* checkOutput(directory, target, filename, source, block)
        executed += 1
      }
    }
  }

  const research = yield* fileSystem.readFileString("docs/start/research-agent.md")
  const researchDirectory = path.join(directory, "research")
  yield* fileSystem.makeDirectory(path.join(researchDirectory, "web"), { recursive: true })
  const researchBlocks = Array.from(
    research.matchAll(/\*\*([\w-]+\.ts)\*\*\r?\n\r?\n```typescript\r?\n([\s\S]*?)^```/gm),
  )
  if (researchBlocks.length === 0 || researchBlocks.length !== Array.from(research.matchAll(typescriptFence)).length) {
    return yield* failure("Research tutorial must label every TypeScript block with its scaffold filename")
  }
  for (const match of researchBlocks) {
    const filename = match[1] === "main.ts" ? "web/main.ts" : (match[1] ?? "")
    yield* fileSystem.writeFileString(path.join(researchDirectory, filename), match[2] ?? "")
    count += 1
  }
  yield* fileSystem.copyFile("examples/docs-snippets/html.ts", path.join(researchDirectory, "web/html.ts"))
  yield* typecheck(directory)
  yield* Console.log(
    `Public install versions match ${version}; ${count} TypeScript blocks typechecked; ${executed} tutorial blocks executed with matching output`,
  )
})

await Effect.runPromise(program().pipe(Effect.scoped, Effect.provide(layer)))
