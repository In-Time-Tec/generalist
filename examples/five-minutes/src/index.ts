/* oxlint-disable effecttsgo/strict-effect-provide -- this example provides the Bun platform at its entry point. */
import { layer as bunServices } from "@effect/platform-bun/BunServices"
import { Console, Effect, FileSystem, Layer, Path, Schema } from "effect"
import { Agent } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Runtime as SqliteRuntime } from "generalist/runtime/sqlite-bun"
import { TestModel } from "generalist/testing"

const assistant = Agent.make({
  name: "five-minute-assistant",
  input: Schema.Struct({ topic: Schema.String }),
  output: Schema.Struct({ summary: Schema.String }),
  instructions: "Summarize the topic in one sentence.",
})

const input = { topic: "durable agents" }
const startOptions = {
  sessionId: "session:five-minutes",
  idempotencyKey: "summary:durable-agents",
}
const expected = "A durable agent can continue an accepted run after its host restarts."

const model = TestModel.layer([
  TestModel.text("Preparing a summary."),
  TestModel.object({ output: { summary: expected } }),
])

const program = Effect.gen(function* () {
  const local = yield* Effect.scoped(
    Layer.build(model).pipe(Effect.flatMap((context) => Agent.run(assistant, input).pipe(Effect.provide(context)))),
  )
  yield* Console.log(`Local: ${local.summary}`)

  const fileSystem = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = yield* fileSystem.makeTempDirectoryScoped({ prefix: "generalist-five-minutes-" })
  const filename = path.join(directory, "runs.sqlite")
  const runtimeLayer = () =>
    Layer.merge(
      SqliteRuntime.layerSqlite({ filename, addresses: [] }).pipe(
        Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      ),
      model,
    )
  const start = Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    yield* runtime.register(assistant)
    return yield* runtime.start(assistant, input, startOptions)
  })

  const firstRunId = yield* Effect.scoped(
    Layer.build(runtimeLayer()).pipe(
      Effect.flatMap((context) =>
        start.pipe(
          Effect.provide(context),
          Effect.map((handle) => handle.runId),
        ),
      ),
    ),
  )

  const recovered = yield* Effect.scoped(
    Layer.build(runtimeLayer()).pipe(
      Effect.flatMap((context) =>
        Effect.gen(function* () {
          const handle = yield* start
          return { runId: handle.runId, output: yield* handle.await }
        }).pipe(Effect.provide(context)),
      ),
    ),
  )

  if (recovered.runId !== firstRunId) return yield* Effect.fail("SQLite did not recover the same Run")
  if (recovered.output.summary !== expected) return yield* Effect.fail("SQLite recovered an unexpected result")
  yield* Console.log(`Recovered ${recovered.runId}: ${recovered.output.summary}`)
})

await Effect.runPromise(program.pipe(Effect.scoped, Effect.provide(bunServices)))
