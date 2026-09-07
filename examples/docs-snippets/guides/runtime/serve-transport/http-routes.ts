import { BunCrypto } from "@effect/platform-bun"
import { Config, Effect, Layer, Option, Redacted } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import * as Durability from "generalist/durability"
import * as S3 from "generalist/durability/s3"
import { ExecutableResolver } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "research-agent" })
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
const services = Layer.mergeAll(
  runtimeLayer,
  TestModel.layer([TestModel.text("Answer.")]),
  Permissions.layerAllowAll,
  Approvals.layerAutoApprove,
)

const apiLayer = Layer.unwrap(
  Generalist.create({ agents: [agent] }).pipe(
    Effect.map((host) =>
      Server.layer({
        host,
        auth: Server.authBearer(Config.succeed(Redacted.make("replace-me"))).pipe(Layer.orDie),
      }),
    ),
    Effect.orDie,
  ),
)

export const serverLayer = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: false },
).pipe(Layer.provideMerge(services), Layer.provideMerge(FetchHttpClient.layer))
