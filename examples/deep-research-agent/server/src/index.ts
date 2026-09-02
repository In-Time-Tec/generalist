import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { Generalist } from "generalist/host"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { Server } from "generalist/server"
import { Config, Effect, Layer } from "effect"
import { FetchHttpClient, HttpRouter } from "effect/unstable/http"
import { agent } from "./agent"
import { layerOrDeterministic } from "./model"
import { toolkit, toolkitLayer } from "./tools"
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

const runtimeLayer = Runtime.layerMemory({ addresses: [] }).pipe(
  Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
)

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitHandlersLayer,
  Permissions.layerAllowAll,
  Approvals.layerDurable({ notify: (request) => Effect.logInfo("approval requested", request) }),
  ModelMiddleware.layerIdentity,
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
