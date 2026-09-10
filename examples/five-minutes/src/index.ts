/* oxlint-disable effecttsgo/strict-effect-provide -- this example provides the Bun platform at its entry point. */
import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, Option, Schema, type Types } from "effect"
import { Agent } from "generalist"
import { activate, layer as layerDurability } from "generalist/durability"
import { type ConnectionOptions, layer as layerS3 } from "generalist/durability/s3"
import { ExecutableResolver, LocalScheduler, Runtime } from "generalist/runtime"
import { layer as testModel, object, text } from "generalist/testing/model"

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

const model = testModel([text("Preparing a summary."), object({ output: { summary: expected } })])

const program = Effect.gen(function* () {
  const local = yield* Effect.scoped(
    Layer.build(model).pipe(Effect.flatMap((context) => Agent.run(assistant, input).pipe(Effect.provide(context)))),
  )
  yield* Console.log(`Local: ${local.summary}`)

  const environment = yield* Config.String("GENERALIST_ENVIRONMENT")
  const tenant = yield* Config.String("GENERALIST_TENANT")
  const partition = yield* Config.String("GENERALIST_PARTITION")
  const bucket = yield* Config.String("GENERALIST_BUCKET")
  const region = yield* Config.String("AWS_REGION")
  const accessKeyId = yield* Config.String("AWS_ACCESS_KEY_ID")
  const secretAccessKey = yield* Config.String("AWS_SECRET_ACCESS_KEY")
  const sessionToken = Option.getOrUndefined(yield* Config.option(Config.String("AWS_SESSION_TOKEN")))
  const endpoint = Option.getOrUndefined(yield* Config.option(Config.String("GENERALIST_S3_ENDPOINT")))
  const confirmed = endpoint === undefined ? false : yield* Config.Boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
  const connection: Types.Mutable<ConnectionOptions> = {
    bucket,
    region,
    credentials: { accessKeyId, secretAccessKey },
  }
  if (sessionToken !== undefined) connection.credentials = { accessKeyId, secretAccessKey, sessionToken }
  if (endpoint !== undefined) {
    connection.endpoint = endpoint
    connection.forcePathStyle = true
    connection.capabilities = {
      conditionalCreate: confirmed,
      strongReadAfterWrite: confirmed,
      consistentListing: confirmed,
    }
  }
  const storage = layerS3(connection)
  // Both scopes use the same remote namespace. Only the reopened scope executes the accepted work.
  const runtimeLayer = () => {
    const reconstructed = layerDurability({
      environment,
      tenant,
      partition,
      addresses: [],
      schedulerMode: "external",
    }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(storage),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.merge(reconstructed, model)
  }
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
          yield* activate
          const scheduler = yield* LocalScheduler.LocalScheduler
          yield* scheduler.drain()
          return { runId: handle.runId, output: yield* handle.await }
        }).pipe(Effect.provide(context)),
      ),
    ),
  )

  if (recovered.runId !== firstRunId) return yield* Effect.fail("Object storage did not recover the same Run")
  if (recovered.output.summary !== expected) return yield* Effect.fail("Object storage recovered an unexpected result")
  yield* Console.log(`Recovered ${recovered.runId}: ${recovered.output.summary}`)
})

await Effect.runPromise(program.pipe(Effect.scoped))
