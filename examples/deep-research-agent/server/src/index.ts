import { BunCrypto } from "@effect/platform-bun"
import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { AgentManifest, Approvals, ModelMiddleware, Permissions, Pins, ToolExecutor } from "generalist"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { Generalist } from "generalist/host"
import { Address, ExecutableManifest, ExecutableRegistration, ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { agent } from "./agent"
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
  Approvals.layerDurable({ notify: (request) => Effect.logInfo("approval requested", request) }),
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
    const capabilities =
      endpoint._tag === "None"
        ? undefined
        : {
            conditionalCreate: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
            strongReadAfterWrite: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
            consistentListing: yield* Config.boolean("GENERALIST_S3_CAPABILITIES_CONFIRMED"),
          }
    const objectStore = S3.layer({
      bucket,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken._tag === "None" ? {} : { sessionToken: sessionToken.value }),
      },
      ...(endpoint._tag === "None" ? {} : { endpoint: endpoint.value, forcePathStyle: true, capabilities }),
    })
    const reconstructed = Durability.layer({
      environment,
      tenant,
      partition,
      addresses: [{ address, executable, registrations }],
    }).pipe(
      Layer.provide(resolver),
      Layer.provide(objectStore),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(reconstructed))
  }),
)

const demoAuth = Layer.succeed(Server.Authentication, Server.Authentication.of({ bearer: (httpEffect) => httpEffect }))

const apiLayer = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) =>
      Server.layer({
        host,
        auth: demoAuth,
      }),
    ),
    Effect.orDie,
  ),
)

/** @experimental */
const serverLayer = (port: number) =>
  HttpRouter.serve(Layer.merge(apiLayer, HttpRouter.cors()), { disableLogger: false }).pipe(
    Layer.provideMerge(layer({ port })),
    Layer.provideMerge(agentServices),
    Layer.provideMerge(runtimeLayer),
    Layer.provideMerge(FetchHttpClient.layer),
  )

/** @experimental */
export const main = Effect.fn("DeepResearchAgent.Server.main")(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(4000))
  yield* Effect.log(`deep-research-agent demo server listening on http://localhost:${port} without authentication`)
  return yield* Layer.launch(serverLayer(port))
})

if (import.meta.main) {
  runMain(main())
}
