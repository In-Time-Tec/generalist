import { BunCrypto } from "@effect/platform-bun"
import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Agent, AgentManifest, Approvals, ModelMiddleware, Permissions, Pins, ToolExecutor } from "generalist"
import { activate, layer as layerDurability } from "generalist/durability"
import { type ConnectionOptions, layer as layerS3 } from "generalist/durability/s3"
import { Host } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { agent } from "./agent"
import { make as makeBrowserAuth } from "./browser-auth.js"
import { layerOrDeterministic } from "./model"
import { toolkit, toolkitLayer, webSearchTool } from "./tools"
import { layer as webSearchLayer } from "./web-search"

/** @experimental */
export const toolkitHandlersLayer = toolkitLayer.pipe(Layer.provideMerge(webSearchLayer))

const toolExecutorLayer = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitHandlersLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
)

/** @experimental */
export const modelLayer = layerOrDeterministic({
  model: "openai/gpt-4o-mini",
  apiKey: Config.redacted("OPENROUTER_API_KEY"),
})

const address = Address.make("agent:deep-research-agent")
const pinnedAgent = AgentManifest.fromLiveAgent(agent, {
  model: Pins.makeModel({ example: "deep-research-agent", revision: "1" }),
  tools: [
    {
      name: webSearchTool.name,
      pin: Pins.makeCapability({ example: "deep-research-agent", tool: webSearchTool.name, revision: "1" }),
    },
  ],
  skills: [],
  services: [],
  policy:
    agent.policy.snapshot === undefined
      ? { _tag: "Pinned", pin: Pins.makeCapability({ example: "deep-research-agent", policy: "1" }) }
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
  codec: "deep-research-agent-example",
  version: "1",
  payload: { agent: agent.name },
}))

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitHandlersLayer,
  Permissions.layerAllowAll,
  Layer.succeed(
    Approvals.Approvals,
    Approvals.Approvals.of({
      resolve: (pending) => {
        if (pending.runId === undefined) {
          return Effect.succeed(Approvals.Denied({ reason: "Durable approvals require a hosted Runtime Run" }))
        }
        return Effect.logInfo("approval requested", {
          runId: pending.runId,
          tool: pending.call.name,
          token: pending.token,
        }).pipe(Effect.as(pending))
      },
    }),
  ),
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
    const sessionToken = yield* Effect.option(Config.string("AWS_SESSION_TOKEN"))
    const endpoint = yield* Effect.option(Config.string("GENERALIST_S3_ENDPOINT"))
    const credentials = { accessKeyId, secretAccessKey }
    if (sessionToken._tag === "Some") Object.assign(credentials, { sessionToken: sessionToken.value })
    const connection: ConnectionOptions = {
      bucket,
      region,
      credentials,
    }
    if (endpoint._tag === "Some") {
      Object.assign(connection, {
        endpoint: endpoint.value,
        forcePathStyle: true,
        capabilities: {
          conditionalCreate: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
          strongReadAfterWrite: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
          consistentListing: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
        },
      })
    }
    const objectStore = layerS3(connection)
    const reconstructed = layerDurability({
      environment,
      tenant,
      partition,
      addresses: [{ address, executable, registrations }],
    }).pipe(Layer.provide(resolver), Layer.provide(objectStore), Layer.provide(BunCrypto.layer))
    return Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed))
  }),
)

const apiLayer = Layer.unwrap(
  Effect.gen(function* () {
    const browserAuth = yield* makeBrowserAuth
    const host = yield* Host.make({ revision: "local", agents: [agent] })
    return Layer.merge(
      Server.layer({
        authorization: { tenantId: browserAuth.tenantId, authorize: () => Effect.succeed(true) },
        host,
        auth: browserAuth.auth,
      }),
      browserAuth.login,
    )
  }).pipe(Effect.orDie),
)

/** @experimental */
const serverLayer = (port: number) =>
  HttpRouter.serve(apiLayer, { disableLogger: false }).pipe(
    Layer.provideMerge(layer({ hostname: "127.0.0.1", port })),
    Layer.provideMerge(agentServices),
    Layer.provideMerge(runtimeLayer),
    Layer.provideMerge(FetchHttpClient.layer),
  )

/** @experimental */
export const main: Effect.Effect<
  never,
  Config.ConfigError | Effect.Error<typeof activate> | Layer.Error<ReturnType<typeof layerS3>>
> = Effect.gen(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(4000))
  yield* Effect.log(
    `deep-research-agent demo server listening on http://localhost:${port} with authenticated browser login`,
  )
  return yield* Layer.launch(serverLayer(port))
})

if (import.meta.main) {
  runMain(main)
}
