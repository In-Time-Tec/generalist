import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { Effect, Layer } from "effect"
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

const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
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

export const httpLayer: Layer.Layer<never, never, HttpServer.HttpServer> = HttpRouter.serve(
  Layer.merge(apiLayer, HttpRouter.cors()).pipe(Layer.provide(HttpServer.layerServices)),
).pipe(Layer.provideMerge(agentServices), Layer.provideMerge(runtimeLayer))
