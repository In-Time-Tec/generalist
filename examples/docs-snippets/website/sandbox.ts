import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, FileSystem, Path } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { layerWorktree, ProcessCommand, SandboxProvider } from "generalist/sandbox"

const program = Effect.gen(function* () {
  const files = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const processes = yield* ChildProcessSpawner.ChildProcessSpawner
  const repo = yield* files.makeTempDirectoryScoped({ prefix: "generalist-sandbox-" })
  yield* processes.string(ChildProcess.make("git", ["init", "--quiet", repo]))
  yield* files.writeFileString(
    path.join(repo, "average.test.ts"),
    [
      'import { expect, test } from "bun:test"',
      "const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length",
      'test("empty input", () => expect(average([])).toBe(0))',
      'test("nonempty input", () => expect(average([2, 4])).toBe(3))',
    ].join("\n"),
  )
  yield* Effect.gen(function* () {
    const provider = yield* SandboxProvider
    const sandbox = yield* provider.acquire()
    const result = yield* sandbox.exec(ProcessCommand.make({ command: "bun", arguments: ["test"] }))
    if (result.exitCode !== 0) return yield* Effect.die(result.stderr)
    yield* Console.log(`Sandbox verification passed. Isolation: ${sandbox.isolation}.`)
  }).pipe(Effect.provide(layerWorktree({ repo })))
})

BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)))
