import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option } from "effect"
import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Generalist } from "generalist/host"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { agent } from "./agent"
import { modelLayer } from "./model"
import { toolkit, toolkitLayer } from "./tools"
import { cannedLayer } from "./web-search"

export const approvalsLayer = Approvals.layerDurable({
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

const runtimeLayer = Layer.unwrap(Effect.gen(function* () {
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
  const reconstructed = Durability.layer({ environment, tenant, partition, addresses: [] }).pipe(
    Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    Layer.provide(S3.layer({
      bucket,
      region,
      credentials: { accessKeyId, secretAccessKey, ...(sessionToken === undefined ? {} : { sessionToken }) },
      ...(endpoint === undefined ? {} : {
        endpoint,
        forcePathStyle: true,
        capabilities: { conditionalCreate: confirmed, strongReadAfterWrite: confirmed, consistentListing: confirmed },
      }),
    })),
    Layer.provide(BunCrypto.layer),
  )
  return Layer.effectDiscard(Durability.activate).pipe(Layer.provideMerge(reconstructed))
}))

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

export const httpLayer = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
).pipe(Layer.provideMerge(agentServices), Layer.provideMerge(runtimeLayer))
