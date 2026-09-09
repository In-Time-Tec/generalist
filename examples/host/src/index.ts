import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream, type Types } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, Instructions, Permissions } from "generalist"
import { activate, layer as layerDurability } from "generalist/durability"
import { type ConnectionOptions, layer as layerS3 } from "generalist/durability/s3"
import { Host } from "generalist/host"
import { ExecutableResolver } from "generalist/runtime"

const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })

let modelCalls = 0
const scriptedModel = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () => {
      modelCalls += 1
      return modelCalls === 1
        ? Stream.make(
            Response.makePart("tool-call", {
              id: "echo-1",
              name: "host_echo",
              params: { text: "hello" },
              providerExecuted: false,
            }),
            finish("tool-calls"),
          )
        : Stream.make(
            Response.makePart("text-delta", {
              id: "answer",
              delta: "The host plugin echoed: hello.",
            }),
            finish("stop"),
          )
    },
  }),
)

const echo = Tool.make("host_echo", {
  description: "Echo text through the Host plugin",
  parameters: Schema.Struct({ text: Schema.String }),
  success: Schema.String,
})
let handled = false
const echoHandler = Toolkit.make(echo).toLayer({
  host_echo: ({ text }) =>
    Effect.sync(() => {
      handled = true
      return text
    }),
})

const assistant = Agent.make({
  name: "host-example",
  input: Schema.Struct({ request: Schema.String }),
  output: Schema.String,
})
const plugin = Host.plugin({
  name: "echo",
  tools: [echo],
  instructions: [Instructions.fromText("echo", "Use host_echo when the user asks you to echo text.")],
})

const program = Effect.gen(function* () {
  const host = yield* Host.make({ revision: "local", agents: { [assistant.name]: assistant }, plugins: [plugin] })
  const session = yield* host.sessions.create({ id: "session:host-example", title: "Host example" })
  const run = yield* host.runs.start(
    session.id,
    assistant,
    { request: "Echo hello through the plugin." },
    { idempotencyKey: "echo-hello" },
  )
  const answer = yield* run.await
  const events = Array.from(
    yield* (yield* host.events.subscribe(session.id)).pipe(
      Stream.takeUntil((event) => event._tag === "Completed"),
      Stream.runCollect,
    ),
  )

  yield* Console.log(`Session: ${session.id} (${session.title})`)
  yield* Console.log(`Run: ${run.id}`)
  yield* Console.log(`Events: ${events.map((event) => event._tag).join(" -> ")}`)
  yield* Console.log(`Plugin handled: ${handled}`)
  yield* Console.log(`Answer: ${answer}`)
})

const runtimeLayer = Layer.unwrap(
  Effect.gen(function* () {
    const environment = yield* Config.string("GENERALIST_ENVIRONMENT")
    const tenant = yield* Config.string("GENERALIST_TENANT")
    const partition = yield* Config.string("GENERALIST_PARTITION")
    const bucket = yield* Config.string("GENERALIST_BUCKET")
    const region = yield* Config.string("AWS_REGION")
    const accessKeyId = yield* Config.string("AWS_ACCESS_KEY_ID")
    const secretAccessKey = yield* Config.string("AWS_SECRET_ACCESS_KEY")
    const sessionToken = Option.getOrUndefined(yield* Config.option(Config.string("AWS_SESSION_TOKEN")))
    const endpoint = Option.getOrUndefined(yield* Config.option(Config.string("GENERALIST_S3_ENDPOINT")))
    const confirmed = endpoint === undefined ? false : yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED")
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
    const reconstructed = layerDurability({ environment, tenant, partition, addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([])),
      Layer.provide(layerS3(connection)),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed))
  }),
)
const runtime = ManagedRuntime.make(
  Layer.mergeAll(runtimeLayer, scriptedModel, Permissions.layerAllowAll, Approvals.layerAutoApprove, echoHandler),
)

try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
