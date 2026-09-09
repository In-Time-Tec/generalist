import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { type RuntimeServices, activate, layer as layerDurability } from "generalist/durability"
import { type Options, layer as layerS3 } from "generalist/durability/s3"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "research-agent" })
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
const services = Layer.mergeAll(
  runtimeLayer,
  TestModel.layer([TestModel.text("Answer.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const apiLayer = Layer.unwrap(
  Host.make({ revision: "local", agents: { agent } }).pipe(
    Effect.map((host) =>
      Server.layer({
        authorization: { tenantId: "example", authorize: () => Effect.succeed(true) },
        host,
        auth: Server.authBearer({
          token: Config.redacted("GENERALIST_SERVER_TOKEN"),
          principal: { id: "example-controller", tenantId: "example", role: "controller" },
        }).pipe(Layer.orDie),
      }),
    ),
    Effect.orDie,
  ),
)

export const serverLayer: Layer.Layer<
  | RuntimeServices
  | Layer.Success<ReturnType<typeof TestModel.layer>>
  | Permissions.Permissions
  | Approvals.Approvals
  | Layer.Success<typeof FetchHttpClient.layer>,
  Config.ConfigError | Effect.Error<typeof activate> | Layer.Error<ReturnType<typeof layerS3>>,
  HttpServer.HttpServer
> = HttpRouter.serve(Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)), {
  disableLogger: false,
}).pipe(Layer.provideMerge(services), Layer.provideMerge(FetchHttpClient.layer))
