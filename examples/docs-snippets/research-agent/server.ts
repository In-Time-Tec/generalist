import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option } from "effect"
import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Host } from "generalist/host"
import { type RuntimeServices, activate, layer as layerDurability } from "generalist/durability"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { toolkit, toolkitLayer } from "./tools"
import { cannedLayer } from "./web-search"

export const approvalsLayer: Layer.Layer<Approvals.Approvals, never, Runtime.Runtime> = Approvals.layerDurable({
  notify: (request) => Effect.logInfo("approval requested", request),
})

export const toolExecutorLayer: Layer.Layer<ToolExecutor.ToolExecutor> = Layer.unwrap(
  Effect.gen(function* () {
    const handlers = yield* Layer.build(toolkitLayer)
    const handledToolkit = yield* toolkit.pipe(Effect.provideContext(handlers))
    return ToolExecutor.layerToolkit(handledToolkit)
  }),
).pipe(Layer.provide(cannedLayer))

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitLayer.pipe(Layer.provideMerge(cannedLayer)),
  Permissions.layerAllowAll,
  approvalsLayer,
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
    const reconstructed = layerDurability({ environment, tenant, partition, addresses: [] }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
      Layer.provide(layerS3(transport)),
      Layer.provide(BunCrypto.layer),
    )
    return Layer.effectDiscard(activate).pipe(Layer.provideMerge(reconstructed))
  }),
)

const applicationAuth = Server.authBearer({
  token: Config.redacted("GENERALIST_SERVER_TOKEN"),
  principal: { id: "example-controller", tenantId: "example", role: "controller" },
})

const apiLayer = Layer.unwrap(
  Host.make({ revision: "local", agents: { agent } }).pipe(
    Effect.map((host) =>
      Server.layer({
        authorization: { tenantId: "example", authorize: () => Effect.succeed(true) },
        host,
        auth: applicationAuth,
      }),
    ),
    Effect.orDie,
  ),
)

export const httpLayer: Layer.Layer<
  Layer.Success<typeof agentServices> | RuntimeServices,
  | Config.ConfigError
  | Layer.Error<ReturnType<typeof Server.authBearer>>
  | Effect.Error<typeof activate>
  | Layer.Error<ReturnType<typeof layerS3>>,
  HttpServer.HttpServer
> = HttpRouter.serve(Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices))).pipe(
  Layer.provideMerge(agentServices),
  Layer.provideMerge(runtimeLayer),
)
