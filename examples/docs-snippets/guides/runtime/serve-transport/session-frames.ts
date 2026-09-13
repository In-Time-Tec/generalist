import { BunCrypto } from "@effect/platform-bun"
import { Console, Config, Effect, Layer, Option, Stream } from "effect"
import { Agent, Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { LanguageModel, Response } from "effect/unstable/ai"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { Cursor, Runtime } from "generalist/runtime"
const agent = Agent.make({ name: "chat-agent" })
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const modelLayer = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      Stream.make(
        Response.makePart("text-delta", { id: "assistant", delta: "Hello from Generalist." }),
        Response.makePart("finish", { reason: "stop", usage, response: { status: 200, headers: {} } }),
      ),
  }),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  ToolExecutor.layerTest({ execute: () => Effect.die("this agent has no tools") }),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
  ModelMiddleware.layerIdentity,
)

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
    let credentials: Options["credentials"] = { accessKeyId, secretAccessKey }
    if (sessionToken !== undefined) credentials = { ...credentials, sessionToken }
    let transport: Options = { bucket, region, credentials }
    if (endpoint !== undefined) {
      transport = {
        ...transport,
        endpoint,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: confirmed,
          strongReadAfterWrite: confirmed,
          consistentListing: confirmed,
        },
      }
    }
    return Runtime.layer({
      agents: { "chat-agent": agent },
      revision: "session-frames-v1",
      namespace: { environment, tenant, partition },
      services: agentServices,
      storage: Layer.merge(layerS3(transport), BunCrypto.layer),
    })
  }),
)

const collectRun = (runId: string, cursor?: number) => {
  const options = { runId }
  if (cursor !== undefined) Object.assign(options, { cursor: Cursor.make(cursor) })
  return Runtime.Runtime.use((runtime) =>
    runtime.events(options).pipe(
      Stream.takeUntil((event) => event._tag === "RunCompleted"),
      Stream.runCollect,
    ),
  )
}

const tags = (events: Iterable<{ readonly sequence: number; readonly _tag: string }>) =>
  Array.from(events)
    .map((event) => `${event.sequence}:${event._tag}`)
    .join(" ")

const program = Effect.scoped(
  Effect.gen(function* () {
    const runtime = yield* Runtime.Runtime
    const handle = yield* runtime.start(agent, "Say hello", {
      sessionId: "docs-1",
      idempotencyKey: "hello-1",
    })
    const live = yield* collectRun(handle.runId)
    yield* Console.log(`live:   ${tags(live)}`)
    const replayed = yield* collectRun(handle.runId, 2)
    yield* Console.log(`replay: ${tags(replayed)}`)
  }),
)

await Effect.runPromise(program.pipe(Effect.provide(runtimeLayer)))
