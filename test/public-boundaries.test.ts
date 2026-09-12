import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { expect, layer } from "@effect/vitest"
import { Effect, Path, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"

const expectedDiagnostics = [
  "has no exported member 'defaults'",
  "WorkingRequirement",
  "SummaryRequirement",
  "Property '[ConsolidationProposerTypeId]' is missing",
]

layer(bunLayer)("A21 public declarations", (it) => {
  it.effect("rejects private names and unbranded proposers with compiler diagnostics", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const root = path.resolve(".")
      const handle = yield* spawner.spawn(
        ChildProcess.make(
          "bun",
          ["--bun", "tsc", "--noEmit", "-p", "test/fixtures/a21-public-boundaries-failure.tsconfig.json"],
          { cwd: root },
        ),
      )
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: 3 },
      )
      const diagnostics = `${stdout}\n${stderr}`
      expect(exitCode).not.toBe(0)
      for (const diagnostic of expectedDiagnostics) expect(diagnostics).toContain(diagnostic)
    }),
  )
})
