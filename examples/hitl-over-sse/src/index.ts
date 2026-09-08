import { BunCrypto } from "@effect/platform-bun"
import { Config, Console, Effect, Layer, ManagedRuntime, Option, Schema, Stream, type Types } from "effect"
import { Agent, AgentManifest, Approvals, ModelMiddleware, Permissions, Pins, ToolExecutor } from "generalist"
import { activate, layer as layerDurability } from "generalist/durability"
import { type ConnectionOptions, layer as layerS3 } from "generalist/durability/s3"
import { Host } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Server } from "generalist/server"

type ModelParams = Parameters<typeof LanguageModel.make>[0]

const modelLayer = (streamText: ModelParams["streamText"]): Layer.Layer<LanguageModel.LanguageModel> =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
      streamText,
    }),
  )

const deployTool = Tool.make("deploy", {
  description: "Deploy a service",
  parameters: Schema.Struct({ service: Schema.String }),
  success: Schema.String,
  needsApproval: true,
})

const toolkit = Toolkit.make(deployTool)
const agent = Agent.make({ name: "release-agent", toolkit })
const address = Address.make("agent:release-agent")
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ example: "hitl-over-sse", revision: "1" }),
  tools: [
    {
      name: deployTool.name,
      pin: Pins.makeCapability({ example: "hitl-over-sse", tool: deployTool.name, revision: "1" }),
    },
  ],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ example: "hitl-over-sse", policy: "1" }) }
      : { _tag: "Portable", policy: agent.policy.snapshot },
  budget: agent.budget ?? {},
  children: [],
})
const executable = ExecutableManifest.make({
  root: pinnedAgent.pin,
  entries: [{ _tag: "Agent", ...pinnedAgent }],
})
const registrations = [...ExecutableRegistration.requiredPins(executable)].map((pin) => ({
  pin,
  codec: "hitl-over-sse-example",
  version: "1",
  payload: { agent: agent.name },
}))
const toolkitLayer = toolkit.toLayer({ deploy: () => Effect.die("approval should suspend before execution") })
const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)
const usage = Response.Usage.make({
  inputTokens: { uncached: 0, total: 0, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 0, text: 0, reasoning: 0 },
})

const agentServices = Layer.mergeAll(
  modelLayer(() =>
    Stream.make(
      Response.makePart("tool-call", {
        id: "deploy-1",
        name: "deploy",
        params: { service: "api" },
        providerExecuted: false,
      }),
      Response.makePart("finish", { reason: "tool-calls", usage, response: { status: 200, headers: {} } }),
    ),
  ),
  toolExecutorLayer,
  toolkitLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (pending) => Effect.succeed({ ...pending, token: "approve-deploy-1" }),
  }),
  ModelMiddleware.layerIdentity,
)

const resolver = ExecutableResolver.layerStatic([
  {
    executable,
    agent: Agent.close(agent, agentServices),
  },
]).pipe(Layer.orDie)
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
    const reconstructed = layerDurability({
      environment,
      tenant,
      partition,
      addresses: [{ address, executable, registrations }],
    }).pipe(Layer.provide(resolver), Layer.provide(layerS3(connection)), Layer.provide(BunCrypto.layer))
    return Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed))
  }),
)

const program = Effect.gen(function* () {
  const host = yield* Host.make({ revision: "local", agents: [agent] })
  const session = yield* host.sessions.create({ id: "release-1" })
  yield* host.runs.start(session.id, agent, "Deploy api", { idempotencyKey: "deploy-api-1" })
  const events = yield* (yield* host.events.subscribe(session.id)).pipe(
    Stream.takeUntil((event) => event._tag === "ApprovalRequested" || event._tag === "Completed"),
    Stream.runCollect,
  )
  const collected = Array.from(events)
  const final = collected.at(-1)
  if (final === undefined) return yield* Effect.die("expected one Host event")
  const encoded = yield* Server.eventCodec.encode(final)
  yield* Console.log(
    `Server HostEvents: ${collected.map((event) => event._tag).join(" -> ")}; final wire bytes: ${encoded.length}`,
  )
})

const runtime = ManagedRuntime.make(Layer.merge(runtimeLayer, agentServices))
try {
  await runtime.runPromise(program)
} finally {
  await runtime.dispose()
}
