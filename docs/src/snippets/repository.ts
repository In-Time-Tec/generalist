import { BunRuntime, BunServices } from "@effect/platform-bun"
import { Console, Effect, FileSystem, Layer, Path, Schema, Stream } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { Agent, Approvals, Permissions } from "generalist"
import { layer, text, toolCall } from "generalist/testing/model"

class VerificationFailed extends Schema.TaggedError<VerificationFailed>()("VerificationFailed", {
  output: Schema.String,
}) {}

const original = "export const average = (values: number[]) => values.reduce((sum, n) => sum + n, 0) / values.length\n"
const corrected =
  "export const average = (values: number[]) => values.length === 0 ? 0 : values.reduce((sum, n) => sum + n, 0) / values.length\n"

const readFile = Tool.make("read_file", {
  description: "Read the exercise's source file.",
  parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]) }),
  success: Schema.String,
  failure: Schema.String,
})
const writeFile = Tool.make("write_file", {
  description: "Replace the exercise's source file after approval.",
  parameters: Schema.Struct({ path: Schema.Literals(["src/average.ts"]), content: Schema.String }),
  success: Schema.String,
  failure: Schema.String,
  needsApproval: true,
})
const toolkit = Toolkit.make(readFile, writeFile)
const coder = Agent.make({ name: "coding-agent", instructions: "Read the file, then apply the smallest fix.", toolkit })

const program = Effect.gen(function* () {
  const files = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const processes = yield* ChildProcessSpawner.ChildProcessSpawner
  const workspace = yield* files.makeTempDirectoryScoped({ prefix: "generalist-coding-" })
  yield* files.makeDirectory(path.join(workspace, "src"))
  yield* files.writeFileString(path.join(workspace, "src/average.ts"), original)
  yield* files.writeFileString(
    path.join(workspace, "average.test.ts"),
    [
      'import { expect, test } from "bun:test"',
      'import { average } from "./src/average"',
      'test("empty input", () => expect(average([])).toBe(0))',
      'test("nonempty input", () => expect(average([2, 4])).toBe(3))',
    ].join("\n"),
  )

  const services = Layer.mergeAll(
    layer([
      toolCall("read_file", { path: "src/average.ts" }),
      toolCall("write_file", { path: "src/average.ts", content: corrected }),
      text("The empty-input guard is ready to test."),
    ]),
    toolkit.toLayer({
      read_file: ({ path: name }) =>
        files.readFileString(path.join(workspace, name)).pipe(Effect.mapError((error) => error.message)),
      write_file: ({ path: name, content }) =>
        files.writeFileString(path.join(workspace, name), content).pipe(
          Effect.as("File updated."),
          Effect.mapError((error) => error.message),
        ),
    }),
    Permissions.layerAllowAll,
    Approvals.layerAutoApprove,
  )

  yield* Agent.run(coder, "Fix average([]) to return 0.").pipe(Effect.provide(services))
  const test = yield* processes.spawn(ChildProcess.make("bun", ["test"], { cwd: workspace }))
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [Stream.mkString(Stream.decodeText(test.stdout)), Stream.mkString(Stream.decodeText(test.stderr)), test.exitCode],
    { concurrency: 3 },
  )
  if (exitCode !== 0) return yield* VerificationFailed.make({ output: `${stdout}${stderr}` })
  yield* Console.log("Patched src/average.ts. Both regression tests passed.")
})

BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)))
