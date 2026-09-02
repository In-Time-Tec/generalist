import { layer } from "@effect/platform-bun/BunHttpServer"
import { runMain } from "@effect/platform-bun/BunRuntime"
import { Approvals, ModelMiddleware, Permissions, ToolExecutor } from "generalist"
import { ExecutableResolver, Runtime } from "generalist/runtime"
import { SSE, WebSocket } from "generalist/unstable/transport"
import { Config, Effect, Layer, Schema } from "effect"
import { FetchHttpClient, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { agent } from "./agent"
import { layerOrDeterministic } from "./model"
import { toolkit, toolkitLayer } from "./tools"
import { layer as webSearchLayer } from "./web-search"

const StartRunInput = Schema.Struct({
  body: Schema.Struct({
    sessionId: Schema.String,
    idempotencyKey: Schema.String,
    prompt: Schema.String,
  }),
})

const RunPathInput = Schema.Struct({ pathParams: Schema.Struct({ id: Schema.String }) })

const RespondInput = Schema.Struct({
  pathParams: Schema.Struct({ id: Schema.String }),
  body: Schema.Struct({
    waitId: Schema.String,
    resolution: Schema.Union([
      Schema.TaggedStruct("Approved", {}),
      Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    ]),
  }),
})

interface ResponseFailure {
  readonly message: string
}

const errorResponse = (status: number) => (error: ResponseFailure) =>
  Effect.succeed(HttpServerResponse.jsonUnsafe({ message: error.message }, { status }))

/** @experimental */
const routesLayer = HttpRouter.use((router) =>
  Effect.gen(function* () {
    yield* router.add("GET", "/ws", WebSocket.handle)

    yield* router.add(
      "GET",
      "/runs/:id/events",
      HttpRouter.schemaNoBody(RunPathInput).pipe(
        Effect.flatMap(({ pathParams }) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            return yield* SSE.respond({ runId: pathParams.id, request, keepAlive: "5 seconds" })
          }),
        ),
        Effect.catchTag("generalist/transport/InvalidCursor", errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs",
      HttpRouter.schemaJson(StartRunInput).pipe(
        Effect.flatMap(({ body }) =>
          Runtime.Runtime.use((runtime) =>
            runtime.start(agent, body.prompt, {
              sessionId: body.sessionId,
              idempotencyKey: body.idempotencyKey,
            }),
          ),
        ),
        Effect.map((handle) => HttpServerResponse.jsonUnsafe({ runId: handle.runId }, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs/:id/respond",
      HttpRouter.schemaJson(RespondInput).pipe(
        Effect.flatMap(({ pathParams, body }) =>
          Runtime.Runtime.use((runtime) =>
            runtime.respond({ runId: pathParams.id, waitId: body.waitId, resolution: body.resolution }),
          ),
        ),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "accepted" }, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )

    yield* router.add(
      "POST",
      "/runs/:id/cancel",
      HttpRouter.schemaNoBody(RunPathInput).pipe(
        Effect.flatMap(({ pathParams }) => Runtime.Runtime.use((runtime) => runtime.cancel({ runId: pathParams.id }))),
        Effect.map(() => HttpServerResponse.jsonUnsafe({ status: "cancellation-requested" }, { status: 202 })),
        Effect.catch(errorResponse(400)),
      ),
    )
  }),
)

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

const agentServices = Layer.mergeAll(
  modelLayer,
  toolExecutorLayer,
  toolkitHandlersLayer,
  Permissions.layerAllowAll,
  Approvals.layerTest({
    resolve: (request) => Effect.succeed({ ...request, token: `approve-${request.call.id}` }),
  }),
  ModelMiddleware.layerIdentity,
)

/** @experimental */
const runtimeLayer = Runtime.layerMemory({
  addresses: [],
}).pipe(Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)))

const registrationLayer = Layer.effectDiscard(Runtime.Runtime.use((runtime) => runtime.register(agent))).pipe(
  Layer.orDie,
)

/** @experimental */
const appLayer = Layer.mergeAll(routesLayer, HttpRouter.cors(), registrationLayer)

/** @experimental */
const serverLayer = (port: number) =>
  HttpRouter.serve(appLayer, { disableLogger: false }).pipe(
    Layer.provideMerge(layer({ port })),
    Layer.provideMerge(runtimeLayer),
    Layer.provideMerge(agentServices),
    Layer.provideMerge(FetchHttpClient.layer),
  )

/** @experimental */
export const main = Effect.fn("DeepResearchAgent.Server.main")(function* () {
  const port = yield* Config.port("PORT").pipe(Config.withDefault(4000))
  yield* Effect.log(`deep-research-agent server listening on http://localhost:${port} (ws at /ws)`)
  return yield* Layer.launch(serverLayer(port))
})

if (import.meta.main) {
  runMain(main())
}
