/* oxlint-disable effecttsgo/strict-effect-provide -- this script is an application entry point. */
import { layer } from "@effect/platform-bun/BunServices"
import { Console, Effect, Fiber, FileSystem, Option, Ref, Result, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

class ScriptedSurfaceFailed extends Schema.TaggedError<ScriptedSurfaceFailed>()(
  "generalist/scripts/ScriptedSurfaceFailed",
  { message: Schema.String },
) {}

interface Target {
  readonly label: string
  readonly args: ReadonlyArray<string>
  readonly cwd: string
  readonly server?: boolean
  readonly expectedOutput?: RegExp
}

const PackageManifest = Schema.Struct({
  scripts: Schema.optionalKey(Schema.Struct({ start: Schema.optionalKey(Schema.String) })),
})

const skippedExamples = new Map([
  ["memory", "requires SUPERMEMORY_API_KEY and model credentials"],
  ["package-catalog", "requires the documented local npm registry and unpublished reference package"],
])

const skippedSnippets = new Map([
  ["apps/docs/src/snippets/guides/agent/middleware/resilience.ts", "requires OPENROUTER_API_KEY"],
  ["apps/docs/src/snippets/guides/runtime/providers/combine-providers.ts", "requires provider credentials"],
  ["apps/docs/src/snippets/guides/runtime/providers/gemini-openai-compat.ts", "requires GOOGLE_AI_STUDIO_API_KEY"],
  ["apps/docs/src/snippets/guides/runtime/providers/layer-first.ts", "requires OPENAI_API_KEY"],
  ["apps/docs/src/snippets/guides/runtime/providers/openrouter.ts", "requires OPENROUTER_API_KEY"],
  ["apps/docs/src/snippets/guides/tools/mcp/connect-server.ts", "requires OPENROUTER_API_KEY and an MCP server"],
  ["apps/docs/src/snippets/research-agent/approve.ts", "requires a running research server and RUN_ID"],
])

const credentialNames = [
  "ANTHROPIC_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "GOOGLE_AI_STUDIO_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "SUPERMEMORY_API_KEY",
] as const

const failure = (message: string): ScriptedSurfaceFailed => ScriptedSurfaceFailed.make({ message })

const sorted = (values: Iterable<string>): Array<string> =>
  Array.from(values).reduce<Array<string>>((result, value) => {
    const index = result.findIndex((item) => value.localeCompare(item) < 0)
    result.splice(index < 0 ? result.length : index, 0, value)
    return result
  }, [])

const exampleTargets = Effect.fn("VerifyScriptedSurfaces.exampleTargets")(function* () {
  const fileSystem = yield* FileSystem.FileSystem
  const names = sorted(yield* fileSystem.readDirectory("examples"))
  const targets: Array<Target> = []
  for (const name of names) {
    const manifestPath = `examples/${name}/package.json`
    if (!(yield* fileSystem.exists(manifestPath))) continue
    const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PackageManifest))(
      yield* fileSystem.readFileString(manifestPath),
    )
    if (manifest.scripts?.start === undefined || skippedExamples.has(name)) continue
    targets.push({
      label: `example ${name}`,
      args: ["run", "start"],
      cwd: `examples/${name}`,
      server: name === "deep-research-agent" || name === "mcp-toolkit-server",
      expectedOutput: name === "deep-research-agent" || name === "mcp-toolkit-server" ? /listening/i : undefined,
    })
  }
  return targets
})

const snippetTargets = Effect.fn("VerifyScriptedSurfaces.snippetTargets")(function* () {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const paths = yield* spawner.lines(ChildProcess.make("rg", ["-l", "^await ", "apps/docs/src/snippets", "-g", "*.ts"]))
  return sorted(paths.filter((path) => !skippedSnippets.has(path))).map(
    (path): Target => ({
      label: `snippet ${path}`,
      args: [path],
      cwd: ".",
    }),
  )
})

const runTarget = Effect.fn("VerifyScriptedSurfaces.runTarget")(
  function* (target: Target) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const output = yield* Ref.make("")
    const command = ChildProcess.make(
      "env",
      [...credentialNames.flatMap((name) => ["-u", name]), "bun", ...target.args],
      { cwd: target.cwd },
    )
    const result = yield* Effect.scoped(
      Effect.gen(function* () {
        const handle = yield* spawner.spawn(command)
        const collector = yield* handle.all.pipe(
          Stream.decodeText(),
          Stream.runForEach((text) => Ref.update(output, (current) => current + text)),
          Effect.forkScoped,
        )
        const exitCode = yield* handle.exitCode.pipe(
          Effect.timeoutOption(target.server === true ? "3 seconds" : "20 seconds"),
        )
        if (Option.isSome(exitCode)) yield* Fiber.join(collector)
        else yield* Effect.sleep("10 millis")
        return { exitCode, output: yield* Ref.get(output) }
      }),
    )
    if (/ModelStreamTruncated|has no tool authorization policy/i.test(result.output)) {
      return yield* failure(`${target.label} emitted a forbidden framework error\n${result.output}`)
    }
    if (target.expectedOutput !== undefined && !target.expectedOutput.test(result.output)) {
      return yield* failure(`${target.label} did not reach its documented output\n${result.output}`)
    }
    if (Option.isNone(result.exitCode)) {
      if (target.server === true) return target
      return yield* failure(`${target.label} timed out\n${result.output}`)
    }
    if (target.server === true) {
      return yield* failure(
        `${target.label} exited before its server timeout with code ${result.exitCode.value}\n${result.output}`,
      )
    }
    if (result.exitCode.value !== 0) {
      return yield* failure(`${target.label} exited with code ${result.exitCode.value}\n${result.output}`)
    }
    return target
  },
  Effect.mapError((error) => (Schema.is(ScriptedSurfaceFailed)(error) ? error : failure(String(error)))),
)

const program = Effect.fn("VerifyScriptedSurfaces.program")(function* () {
  const examples = yield* exampleTargets()
  const snippets = yield* snippetTargets()
  for (const [name, reason] of skippedExamples) yield* Console.log(`SKIP example ${name}: ${reason}`)
  for (const [path, reason] of skippedSnippets) yield* Console.log(`SKIP snippet ${path}: ${reason}`)
  const results = yield* Effect.forEach([...examples, ...snippets], (target) => Effect.result(runTarget(target)), {
    concurrency: 4,
  })
  const failures: Array<string> = []
  for (const result of results) {
    if (Result.isFailure(result)) failures.push(result.failure.message)
    else yield* Console.log(`PASS ${result.success.label}`)
  }
  const skipped = skippedExamples.size + skippedSnippets.size
  const passed = results.length - failures.length
  yield* Console.log(
    `Scripted surfaces: ${passed} passed, ${skipped} skipped, ${failures.length} failed (${examples.length + skippedExamples.size} example starts, ${snippets.length + skippedSnippets.size} snippets)`,
  )
  if (failures.length > 0) return yield* failure(failures.join("\n\n"))
})

await Effect.runPromise(program().pipe(Effect.provide(layer)))
