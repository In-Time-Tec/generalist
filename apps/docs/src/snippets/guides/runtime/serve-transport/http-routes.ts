import { Config, Effect, Layer, Redacted } from "effect"
import { FetchHttpClient, HttpRouter, HttpServer } from "effect/unstable/http"
import { Agent, Approvals, Permissions } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { TestModel } from "generalist/testing"

const agent = Agent.make({ name: "research-agent" })
const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)
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

export const serverLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
  { disableLogger: false },
).pipe(Layer.provideMerge(services), Layer.provideMerge(FetchHttpClient.layer))
